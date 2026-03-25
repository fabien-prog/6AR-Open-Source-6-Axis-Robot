import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

type SocketCtx = {
  socket: Socket;
  connected: boolean;
};

const SocketContext = createContext<SocketCtx | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  // Priority: localStorage override → Vite env var → hardcoded default
  const URL =
    localStorage.getItem("6ar.socketUrl") ??
    (import.meta.env.VITE_SOCKET_URL as string | undefined) ??
    "http://192.168.0.55:5001";

  const socket = useMemo(() => io(URL, { transports: ["websocket"] }), [URL]);
  const [connected, setConnected] = useState<boolean>(socket.connected);

  useEffect(() => {
    // Sync immediately in case the socket already connected (e.g. after StrictMode cleanup)
    setConnected(socket.connected);

    // Re-open the connection if it was closed by the previous cleanup
    if (!socket.connected) socket.connect();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onError = (err: { message?: string }) => console.error("[Socket] connect_error:", err?.message);

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
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within a SocketProvider");
  return ctx;
}
