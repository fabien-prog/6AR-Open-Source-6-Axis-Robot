import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import {
  useCmd,
  useIkRequest,
  useProfileLinear,
  useLinearMove,
  useLinearMoveToTeensy,
  useProfileToTeensy,
  type JointStatus,
} from "@/hooks/useUpdateData";
import { useSocket } from "@/contexts/SocketContext";
import { useQueryClient } from "@tanstack/react-query";
import { useRobotIO } from "./RobotIOContext";
import { useRobotStatus } from "./RobotStatusContext";

type RobotCommandsCtx = {
  restartTeensy: (args?: any) => void;
  getInputs: () => void;
  getOutputs: () => void;
  getSystemStatus: () => void;
  getJointStatus: (j?: number) => void;
  getAllJointStatus: () => Promise<JointStatus[] | null>;

  move: (j: number, t: number, s: number, a: number) => void;
  moveTo: (j: number, t: number, s: number, a: number) => void;
  moveBy: (j: number, d: number, s: number, a: number) => void;
  moveMultiple: (js: number[], ts: number[], ss: number[], as: number[]) => void;
  jog: (j: number, s: number) => void;
  stop: (j: number) => void;
  stopAll: () => void;

  home: (j: number, fast: number, slow: number) => void;
  homeAll: () => Promise<void>;
  abortHoming: () => void;
  isHoming: () => void;

  setSoftLimits: (j: number, m: number, M: number) => void;
  getSoftLimits: (j: number) => void;
  setMaxSpeed: (j: number, v: number) => void;
  getMaxSpeed: (j: number) => void;
  setMaxAccel: (j: number, v: number) => void;
  getMaxAccel: (j: number) => void;
  setHomeOffset: (j: number, v: number) => void;
  getHomeOffset: (j: number) => void;
  setPositionFactor: (j: number, v: number) => void;
  getPositionFactor: (j: number) => void;
  listParameters: () => void;
  setParam: (k: string, v: any) => void;
  getParam: (k: string) => void;
  output: (outs: number[], states: number[]) => void;

  ikRequest: (position: number[], quaternion: number[]) => void;
  profileLinear: (payload: any) => void;
  linearMove: (payload: any) => void;
  linearMoveToTeensy: (position: number[], quaternion: number[], speed: number, angular_speed_deg: number, accel: number) => void;
  profileToTeensy: (position: number[], quaternion: number[], speed: number, angular_speed_deg: number, accel: number) => void;
};

const RobotCommandsContext = createContext<RobotCommandsCtx | null>(null);

export function RobotCommandsProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { socket, connected } = useSocket();
  const { parameters } = useRobotIO();
  const { setIsMoving } = useRobotStatus();

  const didInitRef = useRef(false);

  const restartTeensy = useCmd("Restart");
  const getInputs = useCmd("GetInputs");
  const getOutputs = useCmd("GetOutputs");
  const getSystemStatus = useCmd("GetSystemStatus");
  const getJointStatusCmd = useCmd("GetJointStatus");

  const moveCmd = useCmd("Move");
  const moveToCmd = useCmd("MoveTo");
  const moveByCmd = useCmd("MoveBy");
  const moveMultipleCmd = useCmd("MoveMultiple");
  const jogCmd = useCmd("Jog");
  const stopCmd = useCmd("Stop");
  const stopAll = useCmd("StopAll");

  const homeCmd = useCmd("Home");
  const abortHoming = useCmd("AbortHoming");
  const isHoming = useCmd("IsHoming");

  const setSoftLimitsCmd = useCmd("SetSoftLimits");
  const getSoftLimitsCmd = useCmd("GetSoftLimits");
  const setMaxSpeedCmd = useCmd("SetMaxSpeed");
  const getMaxSpeedCmd = useCmd("GetMaxSpeed");
  const setMaxAccelCmd = useCmd("SetMaxAccel");
  const getMaxAccelCmd = useCmd("GetMaxAccel");
  const setHomeOffsetCmd = useCmd("SetHomeOffset");
  const getHomeOffsetCmd = useCmd("GetHomeOffset");
  const setPositionFactorCmd = useCmd("SetPositionFactor");
  const getPositionFactorCmd = useCmd("GetPositionFactor");
  const listParameters = useCmd("ListParameters");
  const setParamCmd = useCmd("SetParam");
  const getParamCmd = useCmd("GetParam");
  const outputCmd = useCmd("Output");

  const ikRequest = useIkRequest();
  const profileLinear = useProfileLinear();
  const linearMove = useLinearMove();
  const linearMoveToTeensyMutation = useLinearMoveToTeensy();
  const profileToTeensyMutation = useProfileToTeensy();

  useEffect(() => {
    if (!connected) {
      didInitRef.current = false;
      return;
    }
    if (didInitRef.current) return;
    didInitRef.current = true;

    listParameters();
    getSystemStatus();
    getJointStatusCmd();
  }, [connected, listParameters, getSystemStatus, getJointStatusCmd]);

  const getAllJointStatus = useCallback(() => {
    return new Promise<JointStatus[] | null>((resolve) => {
      if (!socket) return resolve(null);

      socket.emit("cmd", { cmd: "GetJointStatus" });

      const handleResponse = (data: any) => {
        qc.setQueryData(["jointStatuses"], data.data);
        socket.off("jointStatusAll", handleResponse);
        resolve(data.data);
      };

      socket.on("jointStatusAll", handleResponse);
    });
  }, [socket, qc]);

  const homeAll = useCallback(async () => {
    if (!socket) throw new Error("Socket not ready");

    const order = [6, 5, 4, 3, 2, 1];
    let idx = 0;

    return await new Promise<void>((resolve, reject) => {
      const onHomed = (msg: any) => {
        const doneJoint = msg?.data?.joint;
        if (doneJoint === order[idx - 1]) sendNext();
      };

      const onTimeout = ({ id }: any) => {
        cleanup();
        reject(new Error(`Teensy timeout while homing (id ${id})`));
      };

      const cleanup = () => {
        socket.off("homed", onHomed);
        socket.off("teensy_timeout", onTimeout);
      };

      const sendNext = () => {
        if (idx >= order.length) {
          cleanup();
          resolve();
          return;
        }

        const j = order[idx++];
        const fast = (parameters as any)[`joint${j}.homingSpeed`] ?? 10;
        const slow = (parameters as any)[`joint${j}.slowHomingSpeed`] ?? 1;
        homeCmd({ joint: j, speedFast: fast, speedSlow: slow });
      };

      socket.on("homed", onHomed);
      socket.on("teensy_timeout", onTimeout);
      sendNext();
    });
  }, [socket, parameters, homeCmd]);

  const value = useMemo<RobotCommandsCtx>(
    () => ({
      restartTeensy,
      getInputs,
      getOutputs,
      getSystemStatus,
      getJointStatus: (j?: number) => getJointStatusCmd({ joint: j }),
      getAllJointStatus,

      move: (j, t, s, a) => moveCmd({ joint: j, target: t, speed: s, accel: a }),
      moveTo: (j, t, s, a) => moveToCmd({ joint: j, target: t, speed: s, accel: a }),
      moveBy: (j, d, s, a) => moveByCmd({ joint: j, delta: d, speed: s, accel: a }),
      moveMultiple: (js, ts, ss, as) => moveMultipleCmd({ joints: js, targets: ts, speeds: ss, accels: as }),
      jog: (j, s) => jogCmd({ joint: j, speed: s }),
      stop: (j) => stopCmd({ joint: j }),
      stopAll,

      home: (j, f, sl) => homeCmd({ joint: j, speedFast: f, speedSlow: sl }),
      homeAll,
      abortHoming,
      isHoming,

      setSoftLimits: (j, m, M) => setSoftLimitsCmd({ joint: j, min: m, max: M }),
      getSoftLimits: (j) => getSoftLimitsCmd({ joint: j }),
      setMaxSpeed: (j, v) => setMaxSpeedCmd({ joint: j, value: v }),
      getMaxSpeed: (j) => getMaxSpeedCmd({ joint: j }),
      setMaxAccel: (j, v) => setMaxAccelCmd({ joint: j, value: v }),
      getMaxAccel: (j) => getMaxAccelCmd({ joint: j }),
      setHomeOffset: (j, v) => setHomeOffsetCmd({ joint: j, value: v }),
      getHomeOffset: (j) => getHomeOffsetCmd({ joint: j }),
      setPositionFactor: (j, v) => setPositionFactorCmd({ joint: j, value: v }),
      getPositionFactor: (j) => getPositionFactorCmd({ joint: j }),
      listParameters,
      setParam: (k, v) => setParamCmd({ key: k, value: v }),
      getParam: (k) => getParamCmd({ key: k }),
      output: (outs, states) => outputCmd({ outputs: outs, states }),

      ikRequest,
      profileLinear,
      linearMove,
      linearMoveToTeensy: (position, quaternion, speed, angular_speed_deg, accel) => {
        setIsMoving(true);
        linearMoveToTeensyMutation.mutate(
          { position, quaternion, speed, angular_speed_deg, accel },
          { onSettled: () => setIsMoving(false) },
        );
      },
      profileToTeensy: (position, quaternion, speed, angular_speed_deg, accel) => {
        setIsMoving(true);
        profileToTeensyMutation.mutate(
          { position, quaternion, speed, angular_speed_deg, accel },
          { onSettled: () => setIsMoving(false) },
        );
      },
    }),
    [
      restartTeensy,
      getInputs,
      getOutputs,
      getSystemStatus,
      getJointStatusCmd,
      getAllJointStatus,
      moveCmd,
      moveToCmd,
      moveByCmd,
      moveMultipleCmd,
      jogCmd,
      stopCmd,
      stopAll,
      homeCmd,
      homeAll,
      abortHoming,
      isHoming,
      setSoftLimitsCmd,
      getSoftLimitsCmd,
      setMaxSpeedCmd,
      getMaxSpeedCmd,
      setMaxAccelCmd,
      getMaxAccelCmd,
      setHomeOffsetCmd,
      getHomeOffsetCmd,
      setPositionFactorCmd,
      getPositionFactorCmd,
      listParameters,
      setParamCmd,
      getParamCmd,
      outputCmd,
      ikRequest,
      profileLinear,
      linearMove,
      linearMoveToTeensyMutation,
      profileToTeensyMutation,
      setIsMoving,
    ],
  );

  return <RobotCommandsContext.Provider value={value}>{children}</RobotCommandsContext.Provider>;
}

export function useRobotCommands() {
  const ctx = useContext(RobotCommandsContext);
  if (!ctx) throw new Error("useRobotCommands must be used within RobotCommandsProvider");
  return ctx;
}