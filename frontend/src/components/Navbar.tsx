"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api, ChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Dialog } from "./ui/Dialog";
import { NotificationsModal } from "./NotificationsModal";
import { Users, MessageSquare, Home, User, LogOut, Database, AlertTriangle, Bell } from "lucide-react";

function CountBadge({ count, tone = "rose" }: { count: number; tone?: "rose" | "indigo" }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-md",
        tone === "rose" ? "bg-rose-500 shadow-rose-500/40" : "bg-indigo-500 shadow-indigo-500/40"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const fetchCounts = useCallback(async () => {
    try {
      const [notifCount, msgCount] = await Promise.all([
        api.getUnreadNotificationsCount(),
        api.getUnreadMessagesCount(),
      ]);
      setUnreadNotifsCount(notifCount);
      setUnreadMessagesCount(msgCount);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (user) fetchCounts();
  }, [user?.username, fetchCounts]);

  // Real-time synchronization
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewNotif = () => setUnreadNotifsCount((prev) => prev + 1);
    const handleNotifsAllRead = () => setUnreadNotifsCount(0);
    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.to?.toLowerCase() === user.username.toLowerCase()) {
        setUnreadMessagesCount((prev) => prev + 1);
      }
    };
    const refreshMessages = () => {
      api.getUnreadMessagesCount().then(setUnreadMessagesCount).catch(console.error);
    };

    socket.on("notification:new", handleNewNotif);
    socket.on("notification:all_read", handleNotifsAllRead);
    socket.on("message:direct", handleNewMessage);
    socket.on("message:read", refreshMessages);
    socket.on("connect", fetchCounts);

    return () => {
      socket.off("notification:new", handleNewNotif);
      socket.off("notification:all_read", handleNotifsAllRead);
      socket.off("message:direct", handleNewMessage);
      socket.off("message:read", refreshMessages);
      socket.off("connect", fetchCounts);
    };
  }, [socket, user, fetchCounts]);

  // Quand on ouvre la messagerie, le compteur sera recalculé par les accusés de lecture
  useEffect(() => {
    if (user && pathname === "/messages") {
      const t = setTimeout(() => api.getUnreadMessagesCount().then(setUnreadMessagesCount).catch(() => undefined), 1200);
      return () => clearTimeout(t);
    }
  }, [pathname, user]);

  if (!user && (pathname === "/login" || pathname === "/register")) {
    return null;
  }

  const navItems = [
    { href: "/feed", label: "Accueil", icon: Home, match: (p: string) => p === "/feed" },
    { href: "/friends", label: "Communauté", icon: Users, match: (p: string) => p === "/friends" },
    {
      href: "/messages",
      label: "Messages",
      icon: MessageSquare,
      match: (p: string) => p === "/messages",
      badge: unreadMessagesCount,
    },
  ];

  return (
    <>
      {/* Top header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/70 bg-slate-950/80 pt-[var(--safe-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-[var(--header-h)] max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
          {/* Brand */}
          <Link href={user ? "/feed" : "/"} className="group flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-indigo-500/25 transition-transform group-hover:scale-105">
              <Database className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="hidden min-w-0 xs:block md:hidden lg:block">
              <div className="flex items-center gap-1.5">
                <span className="bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-base font-extrabold text-transparent sm:text-lg">
                  KivaSocial
                </span>
                <span className="hidden rounded border border-indigo-500/30 bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300 sm:inline">
                  KivaDB
                </span>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          {user && (
            <nav className="hidden items-center gap-1 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-1 md:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-medium transition-all",
                      isActive
                        ? "bg-indigo-600/90 text-white shadow-md shadow-indigo-500/25"
                        : "text-slate-400 hover:bg-slate-800/80 hover:text-white"
                    )}
                  >
                    <span className="relative">
                      <Icon className="h-4 w-4" />
                      <CountBadge count={item.badge || 0} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right Area */}
          <div className="flex items-center gap-1 sm:gap-2">
            <div
              className="flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/90 px-2.5 py-1"
              title={connected ? "Connecté au flux temps réel KivaDB" : "Reconnexion en cours..."}
            >
              <span className="relative flex h-2 w-2">
                {connected && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn("relative inline-flex h-2 w-2 rounded-full", connected ? "bg-emerald-500" : "bg-amber-500")}
                />
              </span>
              <span className="text-[11px] font-medium text-slate-300">
                <span className="hidden whitespace-nowrap lg:inline">{connected ? "KivaDB Live" : "Connexion..."}</span>
                <span className="whitespace-nowrap lg:hidden">{connected ? "Live" : "…"}</span>
              </span>
            </div>

            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setNotificationsModalOpen(true)}
                  className="relative hidden rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-900 hover:text-white md:block"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  <CountBadge count={unreadNotifsCount} tone="indigo" />
                </button>

                <Link
                  href={`/profile/${user.username}`}
                  className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-slate-900 md:pr-3"
                >
                  <Avatar src={user.avatar} fallback={user.username} size="sm" />
                  <div className="hidden text-left lg:block">
                    <p className="max-w-[140px] truncate text-xs font-semibold leading-tight text-white">
                      {user.displayName || user.username}
                    </p>
                    <p className="font-mono text-[10px] text-indigo-400">@{user.username}</p>
                  </div>
                </Link>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLogoutModalOpen(true)}
                  aria-label="Se déconnecter"
                  className="hidden h-9 w-9 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 md:inline-flex"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Connexion
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Inscription</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar (masquée dans la messagerie plein écran) */}
      {user && pathname !== "/messages" && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/80 bg-slate-950/90 pb-[var(--safe-bottom)] backdrop-blur-2xl md:hidden">
          <div className="mx-auto grid h-[var(--bottom-nav-h)] max-w-md grid-cols-5 items-center px-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium transition-colors",
                    isActive ? "text-indigo-300" : "text-slate-400 active:text-white"
                  )}
                >
                  <span className={cn("relative rounded-full px-4 py-1 transition-colors", isActive && "bg-indigo-500/15")}>
                    <Icon className="h-5 w-5" />
                    <CountBadge count={item.badge || 0} />
                  </span>
                  {item.label}
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => setNotificationsModalOpen(true)}
              className="flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium text-slate-400 active:text-white"
            >
              <span className="relative rounded-full px-4 py-1">
                <Bell className="h-5 w-5" />
                <CountBadge count={unreadNotifsCount} tone="indigo" />
              </span>
              Notifs
            </button>

            <Link
              href={`/profile/${user.username}`}
              className={cn(
                "flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium transition-colors",
                pathname.startsWith("/profile") ? "text-indigo-300" : "text-slate-400 active:text-white"
              )}
            >
              <span
                className={cn(
                  "relative rounded-full px-4 py-1 transition-colors",
                  pathname.startsWith("/profile") && "bg-indigo-500/15"
                )}
              >
                <User className="h-5 w-5" />
              </span>
              Profil
            </Link>
          </div>
        </nav>
      )}

      <NotificationsModal
        open={notificationsModalOpen}
        onOpenChange={setNotificationsModalOpen}
        onUnreadChange={setUnreadNotifsCount}
      />

      <Dialog
        open={logoutModalOpen}
        onOpenChange={setLogoutModalOpen}
        title="Se déconnecter ?"
        description="Votre session KivaDB sera supprimée sur cet appareil."
      >
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
          </div>
          <div className="text-xs text-slate-300">
            Vos données, publications et relations restent préservées en sécurité dans KivaDB.
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setLogoutModalOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setLogoutModalOpen(false);
              logout();
            }}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </Button>
        </div>
      </Dialog>
    </>
  );
}
