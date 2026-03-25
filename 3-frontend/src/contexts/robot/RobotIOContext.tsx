import React, { createContext, useContext, useMemo } from "react";
import { useDigitalInputs, useDigitalOutputs, useParameters, type Parameters } from "@/hooks/useUpdateData";

type RobotIOCtx = {
  digitalInputs: any[];
  digitalOutputs: any[];
  parameters: Parameters;
};

const RobotIOContext = createContext<RobotIOCtx | null>(null);

export function RobotIOProvider({ children }: { children: React.ReactNode }) {
  const { data: digitalInputs = [] } = useDigitalInputs();
  const { data: digitalOutputs = [] } = useDigitalOutputs();
  const { data: parameters = {} } = useParameters();

  const value = useMemo<RobotIOCtx>(
    () => ({ digitalInputs, digitalOutputs, parameters }),
    [digitalInputs, digitalOutputs, parameters],
  );

  return <RobotIOContext.Provider value={value}>{children}</RobotIOContext.Provider>;
}

export function useRobotIO() {
  const ctx = useContext(RobotIOContext);
  if (!ctx) throw new Error("useRobotIO must be used within RobotIOProvider");
  return ctx;
}
