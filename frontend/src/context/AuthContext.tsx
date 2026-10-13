"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, UserProfile } from "@/lib/api";

export interface CurrentUser {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  followersCount: number;
  followingCount: number;
}

interface AuthContextType {
  user: CurrentUser | null;
  token: string | null;
  loading: boolean;
  login: (data: { username: string; password: string }) => Promise<void>;
  register: (data: { username: string; password: string; displayName?: string; bio?: string }) => Promise<void>;
  logout: () => Promise<void>;

  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const savedToken = localStorage.getItem("kiva_token");
    const savedUser = localStorage.getItem("kiva_user");

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("kiva_token");
        localStorage.removeItem("kiva_user");
      }
    }
    setLoading(false);
  }, []);

  const login = async (data: { username: string; password: string }) => {
    const res = await api.login(data);
    localStorage.setItem("kiva_token", res.token);
    localStorage.setItem("kiva_user", JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
    router.push("/feed");
  };

  const register = async (data: { username: string; password: string; displayName?: string; bio?: string }) => {
    const res = await api.register(data);
    localStorage.setItem("kiva_token", res.token);
    localStorage.setItem("kiva_user", JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
    router.push("/feed");
  };

  const logout = async () => {
    // Supprimer la session dans KivaDB (côté backend)
    await api.logoutSession();
    // Nettoyer le stockage local
    localStorage.removeItem("kiva_token");
    localStorage.removeItem("kiva_user");
    setUser(null);
    setToken(null);
    router.push("/login");
  };


  const refreshUser = async () => {
    if (!user?.username) return;
    try {
      const fresh = await api.getProfile(user.username);
      setUser(fresh);
      localStorage.setItem("kiva_user", JSON.stringify(fresh));
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
