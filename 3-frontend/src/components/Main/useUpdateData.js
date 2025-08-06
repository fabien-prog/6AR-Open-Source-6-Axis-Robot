// src/components/Main/useUpdateData.js
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSocket } from "./SocketContext";

// ——— helper: emit → Promise —————————————————————————————
export function emitPromise(socket, event, payload = {}) {
    return new Promise((resolve, reject) => {
        if (!socket?.connected) {
            return reject(new Error("Socket not connected"));
        }
        socket.timeout(5000).emit(event, payload, (err, resp) => {
            if (err) return reject(err);
            resolve(resp);
        });
    });
}

// ——— Digital Inputs ————————————————————————————————
export function useDigitalInputs() {
    const { socket, connected } = useSocket();
    const qc = useQueryClient();

    useEffect(() => {
        if (!connected) return;

        const handler = ({ data }) => {
            const arr = [
                { id: 1, status: data.estop === 1, enabled: true },
                ...data.buttons.map((b, i) => ({ id: 2 + i, status: b === 1, enabled: true })),
                ...data.limits.map((l, i) => ({ id: 14 + i, status: l === 1, enabled: true })),
            ];
            qc.setQueryData(["digitalInputs"], arr);
        };

        socket.on("inputStatus", handler);
        socket.emit("GetInputs");
        return () => {
            socket.off("inputStatus", handler);
        };
    }, [socket, connected, qc]);

    return useQuery({
        queryKey: ["digitalInputs"],
        queryFn: () => Promise.resolve([]),
        initialData: Array.from({ length: 19 }, (_, i) => ({
            id: i + 1,
            status: false,
            enabled: true,
        })),
        enabled: connected,
        staleTime: Infinity,
    });
}

// ——— Digital Outputs ——————————————————————————————
export function useDigitalOutputs() {
    const { socket, connected } = useSocket();
    const qc = useQueryClient();

    useEffect(() => {
        if (!connected) return;

        const handler = ({ data }) => {
            const arr = data.states.map((s, i) => ({
                id: i + 1,
                status: s === 1,
                enabled: true,
            }));
            qc.setQueryData(["digitalOutputs"], arr);
        };

        socket.on("outputStatus", handler);
        socket.emit("GetOutputs");
        return () => {
            socket.off("outputStatus", handler);
        };
    }, [socket, connected, qc]);

    return useQuery({
        queryKey: ["digitalOutputs"],
        queryFn: () => Promise.resolve([]),
        initialData: Array.from({ length: 9 }, (_, i) => ({
            id: i + 1,
            status: false,
            enabled: true,
        })),
        enabled: connected,
        staleTime: Infinity,
    });
}

// ——— System Status ——————————————————————————————
export function useSystemStatus() {
    const { socket, connected } = useSocket();
    const qc = useQueryClient();

    useEffect(() => {
        if (!connected) return;

        const handler = ({ data }) => {
            qc.setQueryData(["systemStatus"], {
                status: data.estop ? "E-Stopped" : data.homing ? "Homing" : "Idle",
                uptime: data.uptime,
            });
        };

        socket.on("systemStatus", handler);
        socket.emit("GetSystemStatus");
        return () => {
            socket.off("systemStatus", handler);
        };
    }, [socket, connected, qc]);

    return useQuery({
        queryKey: ["systemStatus"],
        queryFn: () => Promise.resolve({ status: "Idle", uptime: 0 }),
        initialData: { status: "Idle", uptime: 0 },
        enabled: connected,
        staleTime: Infinity,
    });
}

// ——— Joint Statuses ——————————————————————————————
export function useJointStatuses({ live = false } = {}) {
    const { socket, connected } = useSocket();
    const qc = useQueryClient();

    useEffect(() => {
        if (!connected) return;

        const onAll = ({ data }) => qc.setQueryData(["jointStatuses"], data);
        const onSingle = ({ data }) =>
            qc.setQueryData(["jointStatuses"], old =>
                (old ?? []).map(j => (j.joint === data.joint ? { ...j, ...data } : j))
            );

        socket.on("jointStatusAll", onAll);
        socket.on("jointStatus", onSingle);
        socket.emit("GetJointStatus");

        let iv;
        if (live) iv = setInterval(() => socket.emit("GetJointStatus"), 500);

        return () => {
            socket.off("jointStatusAll", onAll);
            socket.off("jointStatus", onSingle);
            clearInterval(iv);
        };
    }, [socket, connected, live, qc]);

    return useQuery({
        queryKey: ["jointStatuses"],
        queryFn: () =>
            Promise.resolve(
                Array.from({ length: 6 }, (_, i) => ({
                    joint: i + 1,
                    position: 0,
                    velocity: 0,
                    acceleration: 0,
                    target: 0,
                }))
            ),
        initialData: Array.from({ length: 6 }, (_, i) => ({
            joint: i + 1,
            position: 0,
            velocity: 0,
            acceleration: 0,
            target: 0,
        })),
        enabled: connected,
        staleTime: Infinity,
    });
}

// ——— Parameters ——————————————————————————————
export function useParameters() {
    const { socket, connected } = useSocket();
    const qc = useQueryClient();

    useEffect(() => {
        if (!connected) return;

        const handler = ({ data }) => qc.setQueryData(["parameters"], data.params || {});
        socket.on("parameters", handler);
        socket.emit("ListParameters");
        return () => {
            socket.off("parameters", handler);
        };
    }, [socket, connected, qc]);

    return useQuery({
        queryKey: ["parameters"],
        queryFn: () => Promise.resolve({}),
        initialData: {},
        enabled: connected,
        staleTime: Infinity,
    });
}

// ——— FK hook ——————————————————————————————————————————
export function useFk() {
    const { socket, connected } = useSocket();
    const qc = useQueryClient();

    useEffect(() => {
        if (!connected) return;

        const handler = ({ fk_position, fk_orientation }) => {
            qc.setQueryData(["fkPosition"], fk_position);
            qc.setQueryData(["fkOrientation"], fk_orientation);
        };

        socket.on("fk_response", handler);
        socket.emit("fk_request", {
            angles: (qc.getQueryData(["jointStatuses"]) ?? []).map(j => j.position),
        });

        return () => {
            socket.off("fk_response", handler);
        };
    }, [socket, connected, qc]);

    const posQ = useQuery({
        queryKey: ["fkPosition"],
        queryFn: () => Promise.resolve([0, 0, 0]),
        initialData: [0, 0, 0],
        enabled: connected,
        staleTime: Infinity,
    });
    const oriQ = useQuery({
        queryKey: ["fkOrientation"],
        queryFn: () => Promise.resolve([[1, 0, 0], [0, 1, 0], [0, 0, 1]]),
        initialData: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        enabled: connected,
        staleTime: Infinity,
    });

    return { fkPosition: posQ.data, fkOrientation: oriQ.data };
}

// ——— Logs ——————————————————————————————————————————
export function useLogs() {
    const { socket, connected } = useSocket();
    const qc = useQueryClient();

    useEffect(() => {
        if (!connected) return;

        const handler = ({ data }) => {
            qc.setQueryData(["logs"], old => [
                ...(old ?? []),
                { id: Date.now(), type: "info", message: data, details: "" },
            ]);
        };

        socket.on("log", handler);
        return () => {
            socket.off("log", handler);
        };
    }, [socket, connected, qc]);

    return useQuery({
        queryKey: ["logs"],
        queryFn: () => Promise.resolve([]),
        initialData: [],
        enabled: connected,
        staleTime: Infinity,
    });
}

// ——— “cmd” fire-and-forget helper ——————————————————————————
export function useCmd(cmdName) {
    const { socket } = useSocket();
    return (args = {}) => {
        if (!socket || !socket.connected) return;
        socket.emit("cmd", { cmd: cmdName, ...args });
    };
}

// ——— IK + linear hooks stay as-is if you need ack/promise behavior ———
// (or you can also simplify them to direct emits if you never use the promise)
export function useIkRequest() {
    const { socket } = useSocket();
    return (position, quaternion) => {
        if (!socket?.connected) return;
        socket.emit("ik_request", { position, quaternion });
    };
}
export function useProfileLinear() {
    const { socket } = useSocket();
    // now takes a single {position, quaternion, speed, accel} object:
    return (payload = {}) => {
        if (!socket?.connected) return;
        // now just emit the object you pass in
        socket.emit("profileLinear", payload);
    };
}

export function useLinearMove() {
    const { socket } = useSocket();
    return (payload = {}) => {
        if (!socket?.connected) return;
        // now just emit the object you pass in
        socket.emit("linearMove", payload);
    };
}

export function useLinearMoveToTeensy() {
    const { socket } = useSocket();
    return useMutation(({ position, quaternion, speed, angular_speed_deg, accel }) =>
        emitPromise(socket, "linearMoveToTeensy", {
            position,
            quaternion,
            speed,
            angular_speed_deg,
            accel,
        })
    );
}

export function useProfileToTeensy() {
    const { socket } = useSocket();
    return useMutation(payload =>
        emitPromise(socket, "profileMoveToTeensy", payload)
    );
}