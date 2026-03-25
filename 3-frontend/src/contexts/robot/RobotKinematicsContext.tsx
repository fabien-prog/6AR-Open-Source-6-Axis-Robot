import React, { createContext, useContext, useMemo } from "react";
import { useJointStatuses, useFk, type JointStatus } from "@/hooks/useUpdateData";

type RobotKinematicsCtx = {
  jointStatuses: JointStatus[];
  joints: number[];
  fkPosition: number[];
  fkOrientation: any[];
};

const RobotKinematicsContext = createContext<RobotKinematicsCtx | null>(null);

export function RobotKinematicsProvider({ children }: { children: React.ReactNode }) {
  const { data: rawJointStatuses = [] } = useJointStatuses();
  const { fkPosition, fkOrientation } = useFk();

  const jointStatuses = useMemo(
    () => (Array.isArray(rawJointStatuses) ? rawJointStatuses : []),
    [rawJointStatuses],
  );

  const joints = useMemo(
    () => jointStatuses.map((js) => js.position),
    [jointStatuses],
  );

  const value = useMemo<RobotKinematicsCtx>(
    () => ({ jointStatuses, joints, fkPosition, fkOrientation }),
    [jointStatuses, joints, fkPosition, fkOrientation],
  );

  return <RobotKinematicsContext.Provider value={value}>{children}</RobotKinematicsContext.Provider>;
}

export function useRobotKinematics() {
  const ctx = useContext(RobotKinematicsContext);
  if (!ctx) throw new Error("useRobotKinematics must be used within RobotKinematicsProvider");
  return ctx;
}
