import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const URL = process.env.REACT_APP_SOCKET_URL || "http://192.168.1.91:5000";

    // Create socket once per URL
    const socket = useMemo(() => io(URL, { transports: ["websocket"] }), [URL]);
    const [connected, setConnected] = useState(socket.connected);

    useEffect(() => {
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        const onError = (err) => console.error("[Socket] connect_error:", err.message);

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("connect_error", onError);

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
            socket.off("connect_error", onError);
            socket.disconnect();
        };
    }, [socket]);

    const value = useMemo(() => ({ socket, connected }), [socket, connected]);
    return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
    const ctx = useContext(SocketContext);
    if (!ctx) throw new Error("useSocket must be used within a SocketProvider");
    return ctx;
};
