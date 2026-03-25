import React, { createContext, useContext, useMemo, useState } from "react";
import { useSystemStatus } from "@/hooks/useUpdateData";
import { useSocket } from "@/contexts/SocketContext";

type RobotStatusCtx = {
  socket: any;
  connected: boolean;
  systemStatus: string;
  elapsedTime: number;
  isMoving: boolean;
  setIsMoving: React.Dispatch<React.SetStateAction<boolean>>;
};

const RobotStatusContext = createContext<RobotStatusCtx | null>(null);

export function RobotStatusProvider({ children }: { children: React.ReactNode }) {
  const { socket, connected } = useSocket();
  const [isMoving, setIsMoving] = useState(false);

  const { data: systemStatusObj = { status: "Idle", uptime: 0 } } = useSystemStatus();

  const value = useMemo<RobotStatusCtx>(
    () => ({
      socket,
      connected,
      systemStatus: systemStatusObj.status,
      elapsedTime: systemStatusObj.uptime,
      isMoving,
      setIsMoving,
    }),
    [socket, connected, systemStatusObj.status, systemStatusObj.uptime, isMoving],
  );

  return <RobotStatusContext.Provider value={value}>{children}</RobotStatusContext.Provider>;
}

export function useRobotStatus() {
  const ctx = useContext(RobotStatusContext);
  if (!ctx) throw new Error("useRobotStatus must be used within RobotStatusProvider");
  return ctx;
}