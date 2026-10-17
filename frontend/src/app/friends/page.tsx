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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Communauté & Amis
            </h1>
            <Badge variant="default" className="font-mono text-xs">
              scan(user:*)
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Découvrez tous les utilisateurs enregistrés dans le workspace{" "}
            <span className="font-mono text-indigo-400 font-semibold">social_app</span> de KivaDB.
          </p>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-80 relative">
          <Input
            type="text"
            placeholder="Rechercher par nom, @..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-8 bg-slate-900/80 border-slate-700/80"
          />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-3 text-xs text-slate-400 hover:text-white"
            >
              ✕
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
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card className="text-center py-16 text-slate-400">
          <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-lg font-bold text-white">Aucun utilisateur trouvé</p>
          <p className="text-sm text-slate-400 mt-1">
            {searchTerm ? "Aucun profil ne correspond à votre recherche." : "La base KivaDB ne contient aucun autre utilisateur."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {filteredUsers.map((member) => {
            const isMe = user?.username === member.username;
            const isPending = followLoading[member.username];

            return (
              <Card
                key={member.username}
                className="group flex flex-col justify-between border-slate-800/80 p-4 shadow-xl transition-all hover:border-slate-700/80 sm:p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <Link
                      href={`/profile/${member.username}`}
                      className="flex items-center gap-3 group-hover:opacity-90 transition-opacity"
                    >
                      <Avatar src={member.avatar} fallback={member.username} size="lg" online={isOnline(member.username)} />
                      <div>
                        <h3 className="font-bold text-white text-base leading-tight group-hover:text-indigo-300 transition-colors">
                          {member.displayName}
                        </h3>
                        <p className="text-xs text-indigo-400 font-mono">@{member.username}</p>
                      </div>
                    </Link>

                    {isMe ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Vous
                      </Badge>
                    ) : member.followsYou ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          Vous suit
                        </Badge>
                        <Badge variant="outline" className="font-mono text-[10px] hidden sm:inline-flex">
                          user:{member.username}
                        </Badge>
                      </div>
                    ) : (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        user:{member.username}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px] mb-4">
                    {member.bio || "Membre actif de KivaSocial."}
                  </p>

                  {/* Counters */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 mb-4 text-center">
                    <div>
                      <div className="text-base font-extrabold text-white">
                        {member.followersCount}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Abonnés
                      </div>
                    </div>
                    <div>
                      <div className="text-base font-extrabold text-white">
                        {member.followingCount}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Abonnements
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                  {!isMe ? (
                    <>
                      <Button
                        variant={member.isFollowing ? "outline" : "default"}
                        size="sm"
                        className={`flex-1 gap-1.5 transition-all ${
                          member.isFollowing
                            ? "hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400"
                            : member.followsYou
                            ? "bg-gradient-to-r from-purple-600 to-indigo-600 shadow-md shadow-purple-500/20"
                            : ""
                        }`}
                        onClick={() => handleToggleFollow(member.username)}
                        isLoading={isPending}
                      >
                        {member.isFollowing ? (
                          <>
                            <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                            Abonné
                          </>
                        ) : member.followsYou ? (
                          <>
                            <UserPlus className="h-3.5 w-3.5 text-white" />
                            Suivre en retour
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3.5 w-3.5" />
                            Suivre
                          </>
                        )}
                      </Button>

                      <Link href={`/messages?with=${member.username}`}>
                        <Button variant="secondary" size="icon" className="h-8 w-8" title="Message">
                          <MessageSquare className="h-3.5 w-3.5 text-slate-300" />
                        </Button>
                      </Link>
                    </>
                  ) : (
                    <Link href={`/profile/${member.username}`} className="w-full">
                      <Button variant="outline" size="sm" className="w-full">
                        Mon profil
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
