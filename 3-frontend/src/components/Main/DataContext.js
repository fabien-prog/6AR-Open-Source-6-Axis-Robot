// src/components/Main/DataContext.js
import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDigitalInputs,
  useDigitalOutputs,
  useSystemStatus,
  useJointStatuses,
  useParameters,
  useFk,
  useLogs,
  useCmd,
  useIkRequest,
  useProfileLinear,
  useLinearMove,
  useLinearMoveToTeensy,
  useProfileToTeensy,
} from "./useUpdateData";
import { useSocket } from "./SocketContext";

const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const qc = useQueryClient();
  const { socket, connected } = useSocket();
  const [isMoving, setIsMoving] = React.useState(false);

  // — streaming data hooks —
  const { data: digitalInputs } = useDigitalInputs();
  const { data: digitalOutputs } = useDigitalOutputs();
  const { data: systemStatusObj = { status: "Idle", uptime: 0 } } = useSystemStatus();
  const { data: rawJointStatuses } = useJointStatuses();
  const jointStatuses = React.useMemo(
    () => (Array.isArray(rawJointStatuses) ? rawJointStatuses : []),
    [rawJointStatuses]
  );
  const { data: parameters } = useParameters();
  const { fkPosition, fkOrientation } = useFk();
  const { data: logs } = useLogs();

  const joints = useMemo(() => jointStatuses.map(js => js.position), [jointStatuses]);

  // — direct-socket “cmd” functions —
  const restartTeensy = useCmd("Restart");
  const getInputs = useCmd("GetInputs");
  const getOutputs = useCmd("GetOutputs");
  const getSystemStatus = useCmd("GetSystemStatus");
  const getJointStatus = useCmd("GetJointStatus");
  const move = useCmd("Move");
  const moveTo = useCmd("MoveTo");
  const moveBy = useCmd("MoveBy");
  const moveMultiple = useCmd("MoveMultiple");
  const jog = useCmd("Jog");
  const stop = useCmd("Stop");
  const stopAll = useCmd("StopAll");
  const home = useCmd("Home");
  const abortHoming = useCmd("AbortHoming");
  const isHoming = useCmd("IsHoming");
  const setSoftLimits = useCmd("SetSoftLimits");
  const getSoftLimits = useCmd("GetSoftLimits");
  const setMaxSpeed = useCmd("SetMaxSpeed");
  const getMaxSpeed = useCmd("GetMaxSpeed");
  const setMaxAccel = useCmd("SetMaxAccel");
  const getMaxAccel = useCmd("GetMaxAccel");
  const setHomeOffset = useCmd("SetHomeOffset");
  const getHomeOffset = useCmd("GetHomeOffset");
  const setPositionFactor = useCmd("SetPositionFactor");
  const getPositionFactor = useCmd("GetPositionFactor");
  const listParameters = useCmd("ListParameters");
  const setParam = useCmd("SetParam");
  const getParam = useCmd("GetParam");
  const output = useCmd("Output");

  // — optional: keep your IK & linear emit helpers if you need them —
  const ikRequest = useIkRequest();
  const profileLinearEmit = useProfileLinear();
  const linearMoveEmit = useLinearMove();
  const linearMoveTeeMutation = useLinearMoveToTeensy();
  const profileMutation = useProfileToTeensy();

  // DataContext.js
  useEffect(() => {
    if (connected) {
      listParameters();
      getSystemStatus();
      getJointStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // memoize everything so consumers only re-render when actual data changes
  const value = useMemo(() => ({
    // connection
    socket, connected,

    // status
    systemStatus: systemStatusObj.status,
    elapsedTime: systemStatusObj.uptime,

    // data
    digitalInputs,
    digitalOutputs,
    jointStatuses,
    joints,
    parameters,
    fkPosition,
    fkOrientation,
    logs,
    clearLogs: () => qc.setQueryData(["logs"], []),
    deleteLog: id => qc.setQueryData(["logs"], old => (old || []).filter(l => l.id !== id)),

    // commands
    restartTeensy,
    getInputs,
    getOutputs,
    getSystemStatus,
    getJointStatus: j => getJointStatus({ joint: j }),
    getAllJointStatus: () => new Promise((resolve) => {
      if (!socket) return resolve(null);

      socket.emit('cmd', { cmd: 'GetJointStatus' });

      const handleResponse = (data) => {
        qc.setQueryData(['jointStatuses'], data.data);
        socket.off('jointStatusAll', handleResponse);
        resolve(data.data);
      };

      socket.on('jointStatusAll', handleResponse);
    }),

    move: (j, t, s, a) => move({ joint: j, target: t, speed: s, accel: a }),
    moveTo: (j, t, s, a) => moveTo({ joint: j, target: t, speed: s, accel: a }),
    moveBy: (j, d, s, a) => moveBy({ joint: j, delta: d, speed: s, accel: a }),
    moveMultiple: (js, ts, ss, as) => moveMultiple({ joints: js, targets: ts, speeds: ss, accels: as }),
    jog: (j, s) => jog({ joint: j, speed: s }),
    stop: j => stop({ joint: j }),
    stopAll,
    home: (j, f, sl) => home({ joint: j, speedFast: f, speedSlow: sl }),
    /**
 * Home all joints sequentially (J6 → J1).
 * Returns a promise that resolves when the last joint reports “homed”.
  */
    homeAll: () => {
      if (!socket) return Promise.reject(new Error('Socket not ready'));

      return new Promise((resolve, reject) => {
        const order = [6, 5, 4, 3, 2, 1];
        let idx = 0;

        // Listener for the "homed" event coming from the Teensy
        const onHomed = (msg) => {
          const doneJoint = msg?.data?.joint;
          if (doneJoint === order[idx - 1]) sendNext();   // proceed
        };

        // Listener for ACK time-outs propagated by server.js
        const onTimeout = ({ id }) => {
          cleanup();
          reject(new Error(`Teensy timeout while homing (id ${id})`));
        };

        const cleanup = () => {
          socket.off('homed', onHomed);
          socket.off('teensy_timeout', onTimeout);
        };

        const sendNext = () => {
          if (idx >= order.length) {
            cleanup();
            resolve();            // all done 🎉
            return;
          }
          const j = order[idx++];

          // use per-joint parameters, fall back to sane defaults
          const fast = parameters[`joint${j}.homingSpeed`] ?? 10;
          const slow = parameters[`joint${j}.slowHomingSpeed`] ?? 1;

          // emit the command (no promise expected)
          home({ joint: j, speedFast: fast, speedSlow: slow });
        };

        socket.on('homed', onHomed);
        socket.on('teensy_timeout', onTimeout);
        sendNext();               // kick off J6
      });
    },
    abortHoming,
    isHoming,
    setSoftLimits: (j, m, M) => setSoftLimits({ joint: j, min: m, max: M }),
    getSoftLimits: j => getSoftLimits({ joint: j }),
    setMaxSpeed: (j, v) => setMaxSpeed({ joint: j, value: v }),
    getMaxSpeed: j => getMaxSpeed({ joint: j }),
    setMaxAccel: (j, v) => setMaxAccel({ joint: j, value: v }),
    getMaxAccel: j => getMaxAccel({ joint: j }),
    setHomeOffset: (j, v) => setHomeOffset({ joint: j, value: v }),
    getHomeOffset: j => getHomeOffset({ joint: j }),
    setPositionFactor: (j, v) => setPositionFactor({ joint: j, value: v }),
    getPositionFactor: j => getPositionFactor({ joint: j }),
    listParameters,
    setParam: (k, v) => setParam({ key: k, value: v }),
    getParam: k => getParam({ key: k }),
    output: (outs, sts) => output({ outputs: outs, states: sts }),

    // specialized
    ikRequest,
    profileLinear: profileLinearEmit,
    linearMove: linearMoveEmit,
    // wrap mutate so callers don’t have to know about useMutation internals
    linearMoveToTeensy: (position, quaternion, speed, angular_speed_deg, accel) =>
      linearMoveTeeMutation.mutate({
        position,
        quaternion,
        speed,
        angular_speed_deg,
        accel,
      }),

    profileToTeensy: (position, quaternion, speed, angular_speed_deg, accel) =>
      profileMutation.mutate({
        position,
        quaternion,
        speed,
        angular_speed_deg,
        accel,
      }),

    // isMoving virtually flags
    isMoving,
    setIsMoving,

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    socket, connected,
    digitalInputs, digitalOutputs, systemStatusObj.status, systemStatusObj.uptime,
    jointStatuses, joints, parameters, fkPosition, fkOrientation, logs, isMoving, linearMoveTeeMutation,
    profileMutation,
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
