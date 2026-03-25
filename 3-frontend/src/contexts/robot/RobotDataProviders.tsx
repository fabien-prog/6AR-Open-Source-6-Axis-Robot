import React from "react";
import { RobotStatusProvider } from "./RobotStatusContext";
import { RobotKinematicsProvider } from "./RobotKinematicsContext";
import { RobotIOProvider } from "./RobotIOContext";
import { RobotLogsProvider } from "./RobotLogsContext";
import { RobotCommandsProvider } from "./RobotCommandsContext";

export function RobotDataProviders({ children }: { children: React.ReactNode }) {
  return (
    <RobotStatusProvider>
      <RobotKinematicsProvider>
        <RobotIOProvider>
          <RobotLogsProvider>
            <RobotCommandsProvider>{children}</RobotCommandsProvider>
          </RobotLogsProvider>
        </RobotIOProvider>
      </RobotKinematicsProvider>
    </RobotStatusProvider>
  );
}
