"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { api, getBackendUrl } from "@/lib/api";

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
  onlineUsers: Set<string>;
  lastSeen: Record<string, number>;
  isOnline: (username?: string) => boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  recentEvents: [],
  onlineUsers: new Set(),
  lastSeen: {},
  isOnline: () => false,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [recentEvents, setRecentEvents] = useState<KivaEventData[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({});
  const { user, token } = useAuth();

  useEffect(() => {
    // Le token de session authentifie le socket : le serveur rejoint lui-même la room privée
    const newSocket = io(getBackendUrl(), {
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 8000,
      auth: token ? { token } : {},
    });

    const syncPresence = () =>
      api
        .getPresence()
        .then((p) => {
          setOnlineUsers(new Set(p.online));
          setLastSeen(p.lastSeen || {});
        })
        .catch(() => undefined);

    newSocket.on("connect", () => {
      setConnected(true);
      syncPresence();
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
    });

    newSocket.on("kiva:event", (event: KivaEventData) => {
      setRecentEvents((prev) => [event, ...prev.slice(0, 19)]);
    });

    newSocket.on("presence:update", (p: { username: string; online: boolean; lastSeen?: number }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (p.online) next.add(p.username);
        else next.delete(p.username);
        return next;
      });
      if (!p.online && p.lastSeen) {
        setLastSeen((prev) => ({ ...prev, [p.username]: p.lastSeen! }));
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user?.username]);

  const isOnline = useCallback(
    (username?: string) => !!username && onlineUsers.has(username.toLowerCase()),
    [onlineUsers]
  );

  return (
    <SocketContext.Provider value={{ socket, connected, recentEvents, onlineUsers, lastSeen, isOnline }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
