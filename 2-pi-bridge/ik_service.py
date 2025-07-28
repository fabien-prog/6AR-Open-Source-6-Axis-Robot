#!/usr/bin/env python3

# ——— Standard & third-party imports ———
import sys, os, json, time                      # system, file, JSON, and timing utilities
import numpy as np                              # numerical computing
from spatialmath.pose3d import SE3              # 3D pose class (position + orientation)
from roboticstoolbox.robot.ERobot import ERobot # Peter Corke's general-purpose robot loader
from scipy.spatial.transform import Rotation as R, Slerp  # quaternion & rotation utilities

# ——— Configuration constants ———
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))   # current script path
URDF_PATH  = os.path.join(                                # URDF path to the robot
    SCRIPT_DIR, "6AR-000-000.SLDASM", "urdf", "6AR-000-000.SLDASM.urdf"
)
CONTROL_DT = 0.02          # control timestep (in seconds)
LM_ILIMIT  = 200           # max iterations for Levenberg-Marquardt IK
V_TCP      = 0.02          # default linear speed (m/s)
ANG_SPEED  = 45.0          # default angular speed (deg/s)
MAX_IK_JUMP_DEG = 30.0     # not currently used — could be for IK jump prevention

# ——— Robot setup ———
robot       = ERobot.URDF(URDF_PATH)            # load robot from URDF
tool_offset = SE3(0, 0, 0.195)                  # TCP offset from flange (195 mm Z offset)
nq          = robot.n                           # number of joints
last_q      = np.zeros(nq)                      # last known joint angles (radians)

# ——— Logger ———
def log(*args):
    print("[IKService]", *args, file=sys.stderr)  # stderr logging

# ——— FK function ———
def compute_fk(q):
    """
    Compute forward kinematics from joint angles.
    Returns TCP (tool center point) position, rotation matrix, and placeholder time.
    """
    Tflange = robot.fkine(q)          # flange pose from FK
    Ttcp    = Tflange * tool_offset   # apply tool transform to get TCP
    return Ttcp.t.tolist(), Ttcp.R.tolist(), 0  # return position, rotation, time=0

# ——— IK function ———
def compute_ik(pos, rot, seed):
    """
    Compute inverse kinematics to reach a given position + orientation.
    Takes a position, optional rotation matrix, and a seed joint state.
    Returns joint angles and placeholder time.
    """
    if rot is None:
        Ttool = SE3(pos)
    else:
        Tmat  = np.block([[rot, np.array(pos)[:, None]], [0, 0, 0, 1]])  # build 4x4 pose matrix
        Ttool = SE3(Tmat)
    Tfl = Ttool * tool_offset.inv()  # compute desired flange pose
    sol = robot.ikine_LM(Tfl, q0=seed, ilimit=LM_ILIMIT, tol=1e-6, joint_limits=True)
    if not sol.success:
        raise ValueError(f"IK failed: {sol.reason}")
    return sol.q, 0

# ——— Linear move with trapezoidal velocity profile ———
def profile_linear_move(req):
    """
    Precompute a joint trajectory with trapezoidal velocity profile.
    Outputs:
        - initial & final joint angles
        - per-step joint speeds and accelerations
        - fixed timestep (dt)
    """
    global last_q

    # ——— Extract inputs ———
    p1       = np.array(req["position"])
    quat1    = req.get("quaternion", [0,0,0,1])
    v_tcp    = req.get("speed", V_TCP)
    a_tcp    = req.get("accel", 0.1)
    ang_spd  = np.deg2rad(req.get("angular_speed_deg", ANG_SPEED))
    jl       = req.get("jointLimits", {})
    vmaxJ    = np.array(jl.get("maxSpeed", [1e6]*nq))    # per-joint velocity limit
    amaxJ    = np.array(jl.get("maxAccel", [1e6]*nq))    # per-joint acceleration limit

    # ——— Initial and final joint states ———
    q0       = last_q.copy()
    q0deg    = np.degrees(q0)
    R1       = R.from_quat(quat1).as_matrix()
    qN, _    = compute_ik(p1.tolist(), R1, q0)
    qNdeg    = np.degrees(qN)

    # ——— Initial TCP pose ———
    p0, R0mat, _ = compute_fk(q0)
    p0           = np.array(p0)
    R0           = np.array(R0mat)

    # ——— Linear and angular travel ———
    d_xyz        = np.linalg.norm(p1 - p0)
    R_delta      = R.from_matrix(R1) * R.from_matrix(R0).inv()
    theta        = R_delta.magnitude()  # angular distance (rad)

    # ——— Total move time ———
    T_lin        = d_xyz / max(v_tcp, 1e-6)
    T_ang        = theta / max(ang_spd, 1e-6)
    T            = max(T_lin, T_ang)

    # ——— Time profile (trapezoid) ———
    t_acc        = min(v_tcp/a_tcp, 0.2*T)
    if 2*t_acc > T: t_acc = T/2
    t_flat       = T - 2*t_acc

    # Travel fraction as a function of time (0 to 1)
    def s_of_t(t):
        if t < t_acc:
            return 0.5 * a_tcp * t**2 / d_xyz
        elif t < t_acc + t_flat:
            return (0.5*a_tcp*t_acc**2 + v_tcp*(t-t_acc)) / d_xyz
        else:
            td = T - t
            return 1 - 0.5*a_tcp*td**2 / d_xyz

    # ——— Generate waypoints along trajectory ———
    N            = int(np.ceil(T/CONTROL_DT))+1
    t_arr        = np.linspace(0, T, N)
    waypoints_q  = []
    slerp        = Slerp([0,1], R.from_matrix([R0, R1]))

    for t in t_arr:
        s        = np.clip(s_of_t(t), 0.0, 1.0)
        pt       = (1-s)*p0 + s*p1
        Rt       = slerp(s).as_matrix()
        qi, _    = compute_ik(pt.tolist(), Rt, waypoints_q[-1] if waypoints_q else q0)
        waypoints_q.append(qi)

    # ——— Compute joint speeds and accels between steps ———
    speeds = []
    accels = []
    prev_q = np.degrees(waypoints_q[0])
    prev_v = np.zeros(nq)

    for i in range(len(waypoints_q)-1):
        q1deg = np.degrees(waypoints_q[i+1])
        vdeg  = (q1deg - prev_q) / CONTROL_DT
        adeg  = (vdeg - prev_v) / CONTROL_DT

        # clamp to joint limits
        vdeg  = np.clip(vdeg, -vmaxJ, vmaxJ)
        adeg  = np.clip(adeg, -amaxJ, amaxJ)

        speeds.append(vdeg.round(2).tolist())
        accels.append(adeg.round(1).tolist())

        prev_q, prev_v = q1deg, vdeg

    last_q = waypoints_q[-1].copy()  # update global joint state

    # ——— Output profile ———
    print(json.dumps({
        "initial": q0deg.tolist(),
        "final":   qNdeg.tolist(),
        "dt":      CONTROL_DT,
        "speeds":  speeds,
        "accels":  accels
    }), flush=True)

# ——— Streaming linear move: output trajectory step by step ———
def streaming_linear_move(req):
    global last_q
    log("streaming_linear_move req:", req)
    if "seed" in req:
        last_q = np.radians(req["seed"][:nq])
        log("  seeded last_q =", last_q)

    # Extract target pose and compute motion duration
    p1        = np.array(req["position"])
    R1        = R.from_quat(req.get("quaternion",[0,0,0,1])).as_matrix()
    speed     = req.get("speed", V_TCP)
    ang_speed = req.get("angular_speed_deg", ANG_SPEED)

    p0, R0m, _ = compute_fk(last_q)
    p0, R0     = np.array(p0), np.array(R0m)
    d_lin = np.linalg.norm(p1-p0)
    d_ang = (R.from_matrix(R1)*R.from_matrix(R0).inv()).magnitude()*(180/np.pi)
    T     = max(d_lin/max(speed,1e-6), d_ang/max(ang_speed,1e-6))
    if T < 1e-6:
        log("  zero‐length move, done")
        print(json.dumps({"status":"linearMoveComplete"}), flush=True)
        return

    # Time samples and orientation interpolation
    steps = max(2, int(np.ceil(T/CONTROL_DT)))
    ts    = np.linspace(0,1,steps)
    slerp = Slerp([0,1], R.from_matrix([R0,R1]))

    # Execute trajectory in real time
    seed      = last_q.copy()
    prev_qdeg = np.degrees(last_q)
    prev_vdeg = np.zeros(nq)

    for t in ts:
        pt = (1-t)*p0 + t*p1
        Rt = slerp(t).as_matrix()
        try:
            qi,_ = compute_ik(pt.tolist(), Rt, seed)
        except ValueError as e:
            log("  IK error:", e)
            print(json.dumps({"type":"linearMoveError","error":str(e)}), flush=True)
            return

        qdeg = np.degrees(qi)
        vdeg = (qdeg-prev_qdeg)/CONTROL_DT
        adeg = (vdeg-prev_vdeg)/CONTROL_DT
        prev_qdeg, prev_vdeg = qdeg.copy(), vdeg.copy()
        seed, last_q = qi.copy(), qi.copy()

        msg = {
          "type":"linearMove",
          "angles":qdeg.tolist(),
          "speeds":vdeg.tolist(),
          "accels":adeg.tolist()
        }
        log("  step →", msg)
        print(json.dumps(msg), flush=True)
        time.sleep(CONTROL_DT)

    log("streaming complete")
    print(json.dumps({"status":"linearMoveComplete"}), flush=True)

# ——— Batched version: generate and return the full trajectory at once ———
def batched_linear_move(req):
    global last_q
    log("batched_linear_move req:", req)
    try:
        # ——— Extract motion parameters ———
        p1    = np.array(req["position"])
        quat  = req.get("quaternion", [0, 0, 0, 1])
        v_tcp = req.get("speed", V_TCP)
        a_tcp = req.get("accel", 0.1)

        # ——— Solve IK for initial and target poses ———
        T0 = SE3(robot.fkine(last_q)) * tool_offset
        sol0, _ = compute_ik(T0.t.tolist(), T0.R, last_q)
        q0 = sol0.copy()

        R1 = R.from_quat(quat).as_matrix()
        T1 = SE3(np.block([[R1, p1[:, None]], [0,0,0,1]])) * tool_offset.inv()
        sol1, _ = compute_ik((T1*tool_offset).t.tolist(),
                             (T1*tool_offset).R, q0)
        q1 = sol1.copy()

        # ——— Path length ———
        p0_list, R0m, _ = compute_fk(last_q)
        p0 = np.array(p0_list)
        d_lin = np.linalg.norm(p1 - p0)
        d_ang = (R.from_matrix(R1)*R.from_matrix(R0m).inv()).magnitude()*(180/np.pi)
        T = max(d_lin / max(v_tcp,1e-6),
                d_ang / max(req.get("angular_speed_deg", ANG_SPEED),1e-6))

        # ——— Trapezoid profile ———
        t_acc = v_tcp / a_tcp if a_tcp > 0 else 0.0
        t_acc = min(t_acc, 0.2 * T)
        if 2*t_acc > T:
            t_acc = T/2.0
        t_flat = T - 2*t_acc

        N     = max(2, int(np.ceil(T/CONTROL_DT)))
        t_arr = np.linspace(0, T, N)
        slerp = Slerp([0,1], R.from_matrix([R0m, R1]))

        log(f"p0 = {p0.tolist()}, p1 = {p1.tolist()}, d_lin = {d_lin:.3f} m")

        # ——— Generate trajectory segments ———
        seed       = last_q.copy()
        prev_qdeg  = np.degrees(last_q)
        prev_vdeg  = np.zeros(nq)
        segments   = []

        for ti in t_arr:
            # s, s', s'' as travel fraction and derivatives
            if ti <= t_acc:
                s   = 0.5 * a_tcp * ti**2 / d_lin
                sd  =       a_tcp * ti     / d_lin
                sdd =       a_tcp           / d_lin
            elif ti <= t_acc + t_flat:
                s   = (0.5*a_tcp*t_acc**2 + v_tcp*(ti - t_acc)) / d_lin
                sd  = v_tcp / d_lin
                sdd = 0.0
            else:
                td  = T - ti
                s   = 1 - 0.5*a_tcp*td**2 / d_lin
                sd  =       a_tcp * td     / d_lin
                sdd =      -a_tcp           / d_lin

            s = min(max(s, 0.0), 1.0)
            pt = (1 - s)*p0 + s*p1
            Rt = slerp(s).as_matrix()
            qi, _ = compute_ik(pt.tolist(), Rt, seed)

            qdeg = np.degrees(qi)
            vdeg = (qdeg - prev_qdeg) / CONTROL_DT
            adeg = (vdeg - prev_vdeg) / CONTROL_DT

            prev_qdeg, prev_vdeg = qdeg.copy(), vdeg.copy()
            seed, last_q         = qi.copy(), qi.copy()

            segments.append({
                "targets": qdeg.round(2).tolist(),
                "speeds":  np.abs(vdeg).round(2).tolist(),
                "accels":  np.abs(adeg).round(1).tolist()
            })

        print(json.dumps({
            "segments":   segments,
            "dt":         CONTROL_DT,
            "total_time": T
        }), flush=True)

    except ValueError as e:
        log("  IK error:", e)
        print(json.dumps({"error": str(e)}), flush=True)
        return

# ——— Main input loop ———
def main():
    global last_q
    log("IK service starting")
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        log("stdin →", line)
        req = json.loads(line)

        # 1) FK from joint angles
        if "angles" in req:
            q_in = np.radians(req["angles"][:nq])
            try:
                pos, ori, _ = compute_fk(q_in)
                last_q      = q_in.copy()
                print(json.dumps({"position":pos,"orientation":ori}), flush=True)
            except Exception as e:
                print(json.dumps({"error":str(e)}), flush=True)

        # 2) batched linear move
        elif "linearMoveToTeensy" in req:
            batched_linear_move(req["linearMoveToTeensy"])

        # 3) streaming linear move
        elif "linearMove" in req:
            streaming_linear_move(req["linearMove"])

        # 4) pure IK query
        elif "position" in req and "quaternion" in req:
            try:
                q_sol,_ = compute_ik(
                  req["position"],
                  R.from_quat(req["quaternion"]).as_matrix(),
                  last_q
                )
                last_q = q_sol.copy()
                print(json.dumps({"angles":np.degrees(q_sol).tolist()}), flush=True)
            except Exception as e:
                print(json.dumps({"error":str(e)}), flush=True)
            
        # 5) trapezoidal profiling request
        elif "profileLinear" in req:
            profile_data = req["profileLinear"]
            if "jointLimits" in req:
                profile_data["jointLimits"] = req["jointLimits"]
            profile_linear_move(profile_data)

        # 6) unknown
        else:
            print(json.dumps({"error":"Invalid arguments"}), flush=True)

if __name__=="__main__":
    main()
