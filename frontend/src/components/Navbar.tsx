"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import {
  Users,
  MessageSquare,
  Home,
  User,
  LogOut,
  Database,
  Radio,
  Sparkles,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { connected } = useSocket();

  if (!user && (pathname === "/login" || pathname === "/register")) {
    return null;
  }

  const navItems = [
    { href: "/feed", label: "Fil d'actualité", icon: Home },
    { href: "/friends", label: "Amis", icon: Users },
    { href: "/messages", label: "Messages", icon: MessageSquare },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
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

          {/* Nav links */}
          {user && (
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? "bg-slate-800 text-white shadow-sm border border-slate-700/60"
                        : "text-slate-400 hover:text-white hover:bg-slate-900"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : ""}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* Status & User menu */}
        <div className="flex items-center gap-3">
          {/* Real-time Status Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="text-xs text-slate-300 font-medium">
              {connected ? "KivaDB Live WS" : "Connexion KivaDB..."}
            </span>
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/profile/${user.username}`}
                className="flex items-center gap-2.5 p-1.5 pr-3 rounded-full hover:bg-slate-900 transition-colors border border-transparent hover:border-slate-800"
              >
                <Avatar src={user.avatar} fallback={user.username} size="sm" />
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-semibold text-white leading-tight">
                    {user.displayName || user.username}
                  </p>
                  <p className="text-[10px] text-indigo-400">@{user.username}</p>
                </div>
              </Link>

              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                title="Se déconnecter"
                className="text-slate-400 hover:text-rose-400"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
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
  );
}
