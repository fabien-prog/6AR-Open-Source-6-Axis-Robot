// src/components/Main/SocketContext.js
import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    // Socket URL – this is static, so memoization never re-runs
    const URL = process.env.REACT_APP_SOCKET_URL || "http://192.168.1.91:5000";

    // Create the socket once
    const socket = useMemo(() => io(URL, { transports: ["websocket"] }), [URL]);

    // Track connection state
    const [connected, setConnected] = useState(socket.connected);

    useEffect(() => {
        const handleConnect = () => setConnected(true);
        const handleDisconnect = () => setConnected(false);
        const handleError = (err) => console.error("[Socket] connect_error:", err.message);

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("connect_error", handleError);

        // Clean up listeners & disconnect on unmount
        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off("connect_error", handleError);
            socket.disconnect();
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={{ socket, connected }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const ctx = useContext(SocketContext);
    if (!ctx) throw new Error("useSocket must be used within a SocketProvider");
    return ctx;
};
