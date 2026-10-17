"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

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
  setUser: (user: CurrentUser) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toCurrentUser(u: any): CurrentUser {
  return {
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    avatar: u.avatar,
    followersCount: u.followersCount ?? 0,
    followingCount: u.followingCount ?? 0,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const persist = (nextToken: string, nextUser: CurrentUser) => {
    localStorage.setItem("kiva_token", nextToken);
    localStorage.setItem("kiva_user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUserState(nextUser);
  };

  const clearLocal = useCallback(() => {
    localStorage.removeItem("kiva_token");
    localStorage.removeItem("kiva_user");
    setUserState(null);
    setToken(null);
  }, []);

  // Restaure la session puis la vérifie auprès du backend (session KivaDB)
  useEffect(() => {
    const savedToken = localStorage.getItem("kiva_token");
    const savedUser = localStorage.getItem("kiva_user");

    if (!savedToken || !savedUser) {
      setLoading(false);
      return;
    }

    try {
      setToken(savedToken);
      setUserState(JSON.parse(savedUser));
    } catch {
      clearLocal();
      setLoading(false);
      return;
    }
    setLoading(false);

    api
      .me()
      .then((fresh) => {
        const next = toCurrentUser(fresh);
        setUserState(next);
        localStorage.setItem("kiva_user", JSON.stringify(next));
      })
      .catch(() => {
        // 401 → géré par l'événement kiva:unauthorized ; erreur réseau → on garde la session locale
      });
  }, [clearLocal]);

  // Session expirée / révoquée côté serveur → retour à la connexion
  useEffect(() => {
    const onUnauthorized = () => {
      if (!localStorage.getItem("kiva_token")) return;
      clearLocal();
      toast.error("Votre session a expiré. Veuillez vous reconnecter.");
      router.push("/login");
    };
    window.addEventListener("kiva:unauthorized", onUnauthorized);
    return () => window.removeEventListener("kiva:unauthorized", onUnauthorized);
  }, [clearLocal, router]);

  const login = async (data: { username: string; password: string }) => {
    const res = await api.login(data);
    persist(res.token, toCurrentUser(res.user));
    router.push("/feed");
  };

  const register = async (data: { username: string; password: string; displayName?: string; bio?: string }) => {
    const res = await api.register(data);
    persist(res.token, toCurrentUser(res.user));
    router.push("/feed");
  };

  const logout = async () => {
    // Supprimer la session dans KivaDB (côté backend)
    await api.logoutSession();
    clearLocal();
    router.push("/login");
  };

  const setUser = useCallback((next: CurrentUser) => {
    const clean = toCurrentUser(next);
    setUserState(clean);
    localStorage.setItem("kiva_user", JSON.stringify(clean));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await api.me();
      setUser(toCurrentUser(fresh));
    } catch {}
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser, setUser }}>
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
