"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { getBackendUrl } from "@/lib/api";

export interface KivaEventData {
  event: string;
  key?: string;
  type?: string | null;
  workspace?: string;
  timestamp?: number;
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  recentEvents: KivaEventData[];
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  recentEvents: [],
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [recentEvents, setRecentEvents] = useState<KivaEventData[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    const backendUrl = getBackendUrl();
    const newSocket = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
    });

    newSocket.on("connect", () => {
      setConnected(true);
      if (user?.username) {
        newSocket.emit("join_user", user.username);
      }
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
    });

    newSocket.on("kiva:event", (event: KivaEventData) => {
      setRecentEvents((prev) => [event, ...prev.slice(0, 19)]);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user?.username]);

  return (
    <SocketContext.Provider value={{ socket, connected, recentEvents }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
