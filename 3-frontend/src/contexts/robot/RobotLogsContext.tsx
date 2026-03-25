import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogs } from "@/hooks/useUpdateData";

type RobotLogsCtx = {
  logs: any[];
  clearLogs: () => void;
  deleteLog: (id: number) => void;
};

const RobotLogsContext = createContext<RobotLogsCtx | null>(null);

export function RobotLogsProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: logs = [] } = useLogs();

  const clearLogs = useCallback(() => {
    qc.setQueryData(["logs"], []);
  }, [qc]);

  const deleteLog = useCallback((id: number) => {
    qc.setQueryData(["logs"], (old: any[]) => (old || []).filter((l) => l.id !== id));
  }, [qc]);

  const value = useMemo<RobotLogsCtx>(
    () => ({
      logs,
      clearLogs,
      deleteLog,
    }),
    [logs, clearLogs, deleteLog],
  );

  return <RobotLogsContext.Provider value={value}>{children}</RobotLogsContext.Provider>;
}

export function useRobotLogs() {
  const ctx = useContext(RobotLogsContext);
  if (!ctx) throw new Error("useRobotLogs must be used within RobotLogsProvider");
  return ctx;
}