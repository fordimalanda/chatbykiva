"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api, UserSummaryItem } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { KivaEventTicker } from "@/components/KivaEventTicker";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  Users,
  UserCheck,
  UserPlus,
  Search,
  MessageSquare,
  Database,
  Radio,
  Sparkles,
  X,
} from "lucide-react";

export default function FriendsPage() {
  const { user, refreshUser } = useAuth();
  const { socket, isOnline, onlineUsers } = useSocket();

  const [users, setUsers] = useState<UserSummaryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  const fetchUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [user]);

  // Real-time synchronization of follow counts and users
  useEffect(() => {
    if (!socket) return;

    const handleUserUpdated = (updated: any) => {
      setUsers((prev) =>
        prev.map((u) => {
          if (u.username === updated.username) {
            const isNowFollowing = user ? (updated.followers || []).includes(user.username) : u.isFollowing;
            return {
              ...u,
              displayName: updated.displayName || u.displayName,
              bio: updated.bio || u.bio,
              avatar: updated.avatar || u.avatar,
              followersCount: updated.followersCount,
              followingCount: updated.followingCount,
              isFollowing: isNowFollowing,
            };
          }
          return u;
        })
      );

      // If current user's profile was touched, refresh context
      if (user && updated.username === user.username) {
        refreshUser();
      }
    };

    socket.on("user:updated", handleUserUpdated);

    return () => {
      socket.off("user:updated", handleUserUpdated);
    };
  }, [socket, user, refreshUser]);

  const handleToggleFollow = async (targetUsername: string) => {
    if (!user) {
      toast.error("Veuillez vous connecter pour vous abonner.");
      return;
    }

    setFollowLoading((prev) => ({ ...prev, [targetUsername]: true }));

    // Optimistic UI update
    setUsers((prev) =>
      prev.map((u) => {
        if (u.username === targetUsername) {
          const nextFollowing = !u.isFollowing;
          return {
            ...u,
            isFollowing: nextFollowing,
            followersCount: nextFollowing ? u.followersCount + 1 : Math.max(0, u.followersCount - 1),
          };
        }
        return u;
      })
    );

    try {
      const res = await api.toggleFollow(targetUsername);
      setUsers((prev) =>
        prev.map((u) =>
          u.username === targetUsername
            ? {
                ...u,
                isFollowing: res.following,
                followersCount: res.followersCount,
                followingCount: res.followingCount,
              }
            : u
        )
      );
      await refreshUser();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la modification du suivi");
      fetchUsers(); // Rollback to actual state
    } finally {
      setFollowLoading((prev) => ({ ...prev, [targetUsername]: false }));
    }
  };

  const [filterTab, setFilterTab] = useState<"all" | "following" | "followers" | "online">("all");

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      u.username.toLowerCase().includes(q) ||
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.bio && u.bio.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterTab === "following") {
      return u.isFollowing;
    }
    if (filterTab === "followers") return !!u.followsYou;
    if (filterTab === "online") return isOnline(u.username);
    return true;
  }).sort((a, b) => Number(isOnline(b.username)) - Number(isOnline(a.username)));

  const filterTabs = [
    { id: "all" as const, label: "Tous", count: users.length },
    {
      id: "online" as const,
      label: "En ligne",
      count: users.filter((u) => u.username !== user?.username && onlineUsers.has(u.username)).length,
    },
    { id: "following" as const, label: "Mes abonnements", count: users.filter((u) => u.isFollowing).length },
    { id: "followers" as const, label: "Mes abonnés", count: users.filter((u) => u.followsYou).length },
  ];

  return (
    <div className="page-container space-y-5">
      <div className="hidden sm:block">
        <KivaEventTicker />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Communauté</h1>
            <Badge variant="default" className="hidden font-mono text-xs sm:inline-flex">
              scan(user:*)
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            <span className="sm:hidden">Trouvez et suivez les membres.</span>
            <span className="hidden sm:inline">
              Tous les membres enregistrés dans le workspace{" "}
              <span className="font-mono font-semibold text-indigo-400">social_app</span> de KivaDB.
            </span>
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Input
            type="search"
            placeholder="Rechercher un membre…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 rounded-full border-slate-700/80 bg-slate-900/80 pl-10 pr-10"
          />
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="scrollbar-none -mx-3 flex items-center gap-2 overflow-x-auto border-b border-slate-800/80 px-3 pb-3 sm:mx-0 sm:px-0">
        {filterTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilterTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all",
              filterTab === t.id
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            {t.id === "online" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            {t.label}
            <span className={cn("tabular-nums", filterTab === t.id ? "text-indigo-200" : "text-slate-500")}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Users Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
              <div className="skeleton h-14 w-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card className="py-14 text-center text-slate-400">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <p className="text-base font-bold text-white">Aucun membre trouvé</p>
          <p className="mt-1 text-sm text-slate-400">
            {searchTerm ? "Aucun profil ne correspond à votre recherche." : "Aucun membre dans ce filtre pour le moment."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {filteredUsers.map((member) => {
            const isMe = user?.username === member.username;
            const isPending = followLoading[member.username];

            return (
              <Card
                key={member.username}
                className="flex flex-col gap-3 border-slate-800/80 p-4 transition-colors hover:border-slate-700/80"
              >
                <div className="flex items-start gap-3">
                  <Link href={`/profile/${member.username}`} className="shrink-0">
                    <Avatar src={member.avatar} fallback={member.username} size="lg" online={isOnline(member.username)} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/profile/${member.username}`}
                        className="truncate text-[15px] font-bold leading-tight text-white hover:text-indigo-300"
                      >
                        {member.displayName}
                      </Link>
                      {isMe ? (
                        <Badge variant="secondary" className="shrink-0 px-2 py-0 text-[10px]">Vous</Badge>
                      ) : member.followsYou ? (
                        <Badge variant="secondary" className="shrink-0 border border-indigo-500/30 bg-indigo-500/15 px-2 py-0 text-[10px] text-indigo-300">
                          {member.isFollowing ? "Ami" : "Vous suit"}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate font-mono text-xs text-indigo-400">@{member.username}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      <strong className="font-semibold text-slate-200">{member.followersCount}</strong> abonné{member.followersCount > 1 ? "s" : ""}
                      <span className="mx-1.5 text-slate-600">·</span>
                      <strong className="font-semibold text-slate-200">{member.followingCount}</strong> abonnement{member.followingCount > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {member.bio && <p className="line-clamp-2 text-sm leading-snug text-slate-300">{member.bio}</p>}

                <div className="mt-auto flex items-center gap-2">
                  {!isMe ? (
                    <>
                      <Button
                        variant={member.isFollowing ? "outline" : "default"}
                        size="sm"
                        className={cn(
                          "h-9 flex-1 gap-1.5",
                          member.isFollowing && "hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400"
                        )}
                        onClick={() => handleToggleFollow(member.username)}
                        isLoading={isPending}
                      >
                        {!isPending &&
                          (member.isFollowing ? (
                            <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          ))}
                        {member.isFollowing ? "Abonné" : member.followsYou ? "Suivre en retour" : "Suivre"}
                      </Button>
                      <Link href={`/messages?with=${member.username}`} aria-label={`Écrire à ${member.displayName}`}>
                        <Button variant="secondary" size="icon" className="h-9 w-9">
                          <MessageSquare className="h-4 w-4 text-slate-300" />
                        </Button>
                      </Link>
                    </>
                  ) : (
                    <Link href={`/profile/${member.username}`} className="w-full">
                      <Button variant="outline" size="sm" className="h-9 w-full">
                        Voir mon profil
                      </Button>
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
