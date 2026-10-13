"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api } from "@/lib/api";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Dialog } from "./ui/Dialog";
import { NotificationsModal } from "./NotificationsModal";
import {
  Users,
  MessageSquare,
  Home,
  User,
  LogOut,
  Database,
  AlertTriangle,
  Bell,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // Load initial counts
  const fetchCounts = async () => {
    if (!user) return;
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
  };

  useEffect(() => {
    if (!user) return;
    fetchCounts();
  }, [user]);

  // Real-time synchronization
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewNotif = () => {
      setUnreadNotifsCount((prev) => prev + 1);
    };

    const handleNotifsAllRead = () => {
      setUnreadNotifsCount(0);
    };

    const handleNewMessage = (msg: any) => {
      // If it's a direct message sent to current user, increment unread messages
      if (msg.to?.toLowerCase() === user.username.toLowerCase()) {
        setUnreadMessagesCount((prev) => prev + 1);
      }
    };

    const handleMessageRead = () => {
      api.getUnreadMessagesCount().then(setUnreadMessagesCount).catch(console.error);
    };

    socket.on("notification:new", handleNewNotif);
    socket.on("notification:all_read", handleNotifsAllRead);
    socket.on("message:direct", handleNewMessage);
    socket.on("message:read", handleMessageRead);

    return () => {
      socket.off("notification:new", handleNewNotif);
      socket.off("notification:all_read", handleNotifsAllRead);
      socket.off("message:direct", handleNewMessage);
      socket.off("message:read", handleMessageRead);
    };
  }, [socket, user]);

  if (!user && (pathname === "/login" || pathname === "/register")) {
    return null;
  }

  const navItems = [
    { href: "/feed", label: "Fil d'actualité", icon: Home },
    { href: "/friends", label: "Amis", icon: Users },
    {
      href: "/messages",
      label: "Messages",
      icon: MessageSquare,
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
    },
  ];

  const handleConfirmLogout = () => {
    setLogoutModalOpen(false);
    logout();
  };

  return (
    <>
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-6">
            <Link href="/feed" className="flex items-center gap-2.5 group">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform">
                <Database className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-lg text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300">
                    KivaSocial
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    KivaDB
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">100% NoSQL Key-Value</p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            {user && (
              <nav className="hidden md:flex items-center gap-1.5 ml-4">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "bg-indigo-600/15 text-indigo-300 shadow-sm border border-indigo-500/30"
                          : "text-slate-400 hover:text-white hover:bg-slate-900/80"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-slate-400"}`} />
                      {item.label}

                      {/* Unread badge for Messages */}
                      {item.badge !== undefined && (
                        <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Right Area: Status, Notifications & User */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Real-time Status Badge */}
            <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-slate-900/90 border border-slate-800/80 shadow-inner">
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    connected ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    connected ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
              </span>
              <span className="text-[11px] sm:text-xs text-slate-300 font-medium">
                {connected ? (
                  <span className="hidden sm:inline">KivaDB Live</span>
                ) : (
                  <span className="hidden sm:inline">Connexion KivaDB...</span>
                )}
                <span className="sm:hidden">{connected ? "Live" : "..."}</span>
              </span>
            </div>

            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Notifications Bell Button */}
                <button
                  type="button"
                  onClick={() => setNotificationsModalOpen(true)}
                  className="relative p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900 transition-colors border border-transparent hover:border-slate-800"
                  title="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadNotifsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold shadow-md shadow-indigo-500/40 animate-pulse">
                      {unreadNotifsCount > 99 ? "99+" : unreadNotifsCount}
                    </span>
                  )}
                </button>

                {/* Profile Link */}
                <Link
                  href={`/profile/${user.username}`}
                  className="flex items-center gap-2 p-1 sm:pr-3 rounded-full hover:bg-slate-900 transition-colors border border-transparent hover:border-slate-800"
                >
                  <Avatar src={user.avatar} fallback={user.username} size="sm" className="ring-2 ring-indigo-500/20" />
                  <div className="hidden lg:block text-left">
                    <p className="text-xs font-semibold text-white leading-tight">
                      {user.displayName || user.username}
                    </p>
                    <p className="text-[10px] text-indigo-400 font-mono">@{user.username}</p>
                  </div>
                </Link>

                {/* Logout Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLogoutModalOpen(true)}
                  title="Se déconnecter"
                  className="h-9 w-9 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
                    Connexion
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="text-xs sm:text-sm">
                    Inscription
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Hidden on /messages for full-screen chat) */}
      {user && pathname !== "/messages" && (
        <nav className="md:hidden fixed bottom-3 left-3 right-3 z-40 bg-slate-950/90 border border-slate-800/80 backdrop-blur-2xl px-3 py-2 rounded-2xl flex items-center justify-around shadow-2xl shadow-black/60">
          <Link
            href="/feed"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === "/feed"
                ? "text-indigo-300 font-bold bg-indigo-500/15"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Home className="h-5 w-5" />
            <span className="text-[10px]">Accueil</span>
          </Link>

          <Link
            href="/friends"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === "/friends"
                ? "text-indigo-300 font-bold bg-indigo-500/15"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Users className="h-5 w-5" />
            <span className="text-[10px]">Amis</span>
          </Link>

          <Link
            href="/messages"
            className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === "/messages"
                ? "text-indigo-300 font-bold bg-indigo-500/15"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <div className="relative">
              <MessageSquare className="h-5 w-5" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -right-2 h-3.5 min-w-3.5 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadMessagesCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Chat</span>
          </Link>

          <button
            type="button"
            onClick={() => setNotificationsModalOpen(true)}
            className="relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-slate-400 hover:text-white transition-all"
          >
            <div className="relative">
              <Bell className="h-5 w-5" />
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-2 h-3.5 min-w-3.5 px-0.5 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadNotifsCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Notifs</span>
          </button>

          <Link
            href={`/profile/${user.username}`}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname.startsWith("/profile")
                ? "text-indigo-300 font-bold bg-indigo-500/15"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <User className="h-5 w-5" />
            <span className="text-[10px]">Profil</span>
          </Link>
        </nav>
      )}

      {/* Notifications Modal */}
      <NotificationsModal
        open={notificationsModalOpen}
        onOpenChange={setNotificationsModalOpen}
        onUnreadChange={setUnreadNotifsCount}
      />

      {/* Logout Confirmation Dialog Modal */}
      <Dialog
        open={logoutModalOpen}
        onOpenChange={setLogoutModalOpen}
        title="Confirmation de déconnexion"
        description="Êtes-vous sûr de vouloir vous déconnecter de votre compte KivaSocial ?"
      >
        <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 mb-6">
          <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
          </div>
          <div className="text-xs text-slate-300">
            Votre session locale sera fermée. Vos données et relations restent préservées en sécurité dans KivaDB.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setLogoutModalOpen(false)}
            className="flex-1 sm:flex-initial"
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmLogout}
            className="flex-1 sm:flex-initial gap-2 shadow-lg shadow-rose-500/20"
          >
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </Button>
        </div>
      </Dialog>
    </>
  );
}
