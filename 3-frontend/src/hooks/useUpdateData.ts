import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import { useSocket } from "../contexts/SocketContext";

// ---------------- Types ----------------

export type DigitalIn = { id: number; status: boolean; enabled: boolean };
export type DigitalOut = { id: number; status: boolean; enabled: boolean };

export type SystemStatus = { status: string; uptime: number };

export type JointStatus = {
  joint: number;
  position: number;
  velocity: number;
  acceleration: number;
  target: number | null;
};

export type Parameters = Record<string, number | string | boolean>;

export type FKOrientation = [number, number, number][];
export type FKPosition = [number, number, number];

// ---------------- Helpers ----------------

export function emitPromise<T = any>(socket: Socket, event: string, payload: any = {}) {
  return new Promise<T>((resolve, reject) => {
    if (!socket?.connected) return reject(new Error("Socket not connected"));
    socket.timeout(5000).emit(event, payload, (err: any, resp: T) => {
      if (err) return reject(err);
      resolve(resp);
    });
  });
}

// small helper to avoid ever returning Socket from cleanup
function on<T = any>(socket: Socket, event: string, handler: (payload: T) => void) {
  socket.on(event, handler as any);
  return () => {
    socket.off(event, handler as any);
  };
}

// ---------------- Digital Inputs ----------------

export function useDigitalInputs() {
  const { socket, connected } = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!connected) return;

    const handler = ({ data }: any) => {
      const arr: DigitalIn[] = [
        { id: 1, status: data.estop === 1, enabled: true },
        ...(data.buttons ?? []).map((b: number, i: number) => ({ id: 2 + i, status: b === 1, enabled: true })),
        ...(data.limits ?? []).map((l: number, i: number) => ({ id: 14 + i, status: l === 1, enabled: true })),
      ];
      qc.setQueryData(["digitalInputs"], arr);
    };

    const off = on(socket, "inputStatus", handler);
    socket.emit("GetInputs");

    return () => {
      off();
    };
  }, [socket, connected, qc]);

  return useQuery({
    queryKey: ["digitalInputs"],
    queryFn: async () => [],
    initialData: Array.from({ length: 19 }, (_, i) => ({ id: i + 1, status: false, enabled: true })) as DigitalIn[],
    enabled: connected,
    staleTime: Infinity,
  });
}

// ---------------- Digital Outputs ----------------

export function useDigitalOutputs() {
  const { socket, connected } = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!connected) return;

    const handler = ({ data }: any) => {
      const arr: DigitalOut[] = (data.states ?? []).map((s: number, i: number) => ({
        id: i + 1,
        status: s === 1,
        enabled: true,
      }));
      qc.setQueryData(["digitalOutputs"], arr);
    };

    const off = on(socket, "outputStatus", handler);
    socket.emit("GetOutputs");

    return () => {
      off();
    };
  }, [socket, connected, qc]);

  return useQuery({
    queryKey: ["digitalOutputs"],
    queryFn: async () => [],
    initialData: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, status: false, enabled: true })) as DigitalOut[],
    enabled: connected,
    staleTime: Infinity,
  });
}

// ---------------- System Status ----------------

export function useSystemStatus() {
  const { socket, connected } = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!connected) return;

    const handler = ({ data }: any) => {
      qc.setQueryData(["systemStatus"], {
        status: data.estop ? "E-Stopped" : data.homing ? "Homing" : "Idle",
        uptime: data.uptime ?? 0,
      } satisfies SystemStatus);
    };

    const off = on(socket, "systemStatus", handler);
    socket.emit("GetSystemStatus");

    return () => {
      off();
    };
  }, [socket, connected, qc]);

  return useQuery<SystemStatus>({
    queryKey: ["systemStatus"],
    queryFn: async () => ({ status: "Idle", uptime: 0 }),
    initialData: { status: "Idle", uptime: 0 },
    enabled: connected,
    staleTime: Infinity,
  });
}

// ---------------- Joint Statuses ----------------

export function useJointStatuses({ live = false }: { live?: boolean } = {}) {
  const { socket, connected } = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!connected) return;

    const onAll = ({ data }: any) => qc.setQueryData(["jointStatuses"], data);
    const onSingle = ({ data }: any) => qc.setQueryData(["jointStatuses"], (old: JointStatus[] | undefined) => (old ?? []).map((j) => (j.joint === data.joint ? { ...j, ...data } : j)));

    const offAll = on(socket, "jointStatusAll", onAll);
    const offSingle = on(socket, "jointStatus", onSingle);

    socket.emit("GetJointStatus");

    let iv: number | null = null;
    if (live) iv = window.setInterval(() => socket.emit("GetJointStatus"), 500);

    return () => {
      offAll();
      offSingle();
      if (iv != null) window.clearInterval(iv);
    };
  }, [socket, connected, live, qc]);

  const initial = Array.from({ length: 6 }, (_, i) => ({
    joint: i + 1,
    position: 0,
    velocity: 0,
    acceleration: 0,
    target: 0,
  })) satisfies JointStatus[];

  return useQuery<JointStatus[]>({
    queryKey: ["jointStatuses"],
    queryFn: async () => initial,
    initialData: initial,
    enabled: connected,
    staleTime: Infinity,
  });
}

// ---------------- Parameters ----------------

export function useParameters() {
  const { socket, connected } = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!connected) return;

    const handler = ({ data }: any) => qc.setQueryData(["parameters"], data?.params ?? {});
    const off = on(socket, "parameters", handler);

    socket.emit("ListParameters");

    return () => {
      off();
    };
  }, [socket, connected, qc]);

  return useQuery<Parameters>({
    queryKey: ["parameters"],
    queryFn: async () => ({}),
    initialData: {},
    enabled: connected,
    staleTime: Infinity,
  });
}

// ---------------- FK ----------------

export function useFk() {
  const { socket, connected } = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!connected) return;

    const handler = ({ fk_position, fk_orientation }: any) => {
      qc.setQueryData(["fkPosition"], fk_position);
      qc.setQueryData(["fkOrientation"], fk_orientation);
    };

    const off = on(socket, "fk_response", handler);

    socket.emit("fk_request", {
      angles: ((qc.getQueryData(["jointStatuses"]) as JointStatus[] | undefined) ?? []).map((j) => j.position),
    });

    return () => {
      off();
    };
  }, [socket, connected, qc]);

  const posQ = useQuery<FKPosition>({
    queryKey: ["fkPosition"],
    queryFn: async () => [0, 0, 0],
    initialData: [0, 0, 0],
    enabled: connected,
    staleTime: Infinity,
  });

  const oriQ = useQuery<FKOrientation>({
    queryKey: ["fkOrientation"],
    queryFn: async () => [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    initialData: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    enabled: connected,
    staleTime: Infinity,
  });

  return { fkPosition: posQ.data, fkOrientation: oriQ.data };
}

// ---------------- Logs ----------------

export type LogItem = { id: number; type: "info" | "warn" | "error"; message: string; details?: string };

export function useLogs() {
  const { socket, connected } = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!connected) return;

    const handler = ({ data }: any) => {
      qc.setQueryData(["logs"], (old: LogItem[] | undefined) => [...(old ?? []), { id: Date.now(), type: "info", message: String(data ?? ""), details: "" }]);
    };

    const off = on(socket, "log", handler);
    return () => {
      off();
    };
  }, [socket, connected, qc]);

  return useQuery<LogItem[]>({
    queryKey: ["logs"],
    queryFn: async () => [],
    initialData: [],
    enabled: connected,
    staleTime: Infinity,
  });
}

// ---------------- cmd helper ----------------

export function useCmd(cmdName: string) {
  const { socket } = useSocket();
  return (args: Record<string, any> = {}) => {
    if (!socket?.connected) return;
    socket.emit("cmd", { cmd: cmdName, ...args });
  };
}

// ---------------- IK + linear ----------------

export function useIkRequest() {
  const { socket } = useSocket();
  return (position: number[], quaternion: number[]) => {
    if (!socket?.connected) return;
    socket.emit("ik_request", { position, quaternion });
  };
}

export function useProfileLinear() {
  const { socket } = useSocket();
  return (payload: any = {}) => {
    if (!socket?.connected) return;
    socket.emit("profileLinear", payload);
  };
}

export function useLinearMove() {
  const { socket } = useSocket();
  return (payload: any = {}) => {
    if (!socket?.connected) return;
    socket.emit("linearMove", payload);
  };
}

export function useLinearMoveToTeensy() {
  const { socket } = useSocket();
  return useMutation({
    mutationFn: (p: { position: number[]; quaternion: number[]; speed: number; angular_speed_deg: number; accel: number }) => emitPromise(socket, "linearMoveToTeensy", p),
  });
}

export function useProfileToTeensy() {
  const { socket } = useSocket();
  return useMutation({
    mutationFn: (payload: any) => emitPromise(socket, "profileMoveToTeensy", payload),
  });
}
