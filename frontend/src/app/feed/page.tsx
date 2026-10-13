"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api, ChatMessage, UserSummaryItem } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { KivaEventTicker } from "@/components/KivaEventTicker";
import { formatTime } from "@/lib/utils";
import {
  Users,
  MessageSquare,
  Send,
  Database,
  Radio,
  Sparkles,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

export default function FeedPage() {
  const { user, loading, refreshUser } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [friends, setFriends] = useState<UserSummaryItem[]>([]);
  const [newContent, setNewContent] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    // Fetch initial messages and registered users
    api.getMessages().then(setMessages).catch(console.error);
    api.getUsers().then(setFriends).catch(console.error);
  }, [user]);

  // Real-time synchronization via KivaDB WebSocket bridge
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const handleUserUpdated = (updated: any) => {
      // If current user was updated (e.g. someone followed us)
      if (user && updated.username === user.username) {
        refreshUser();
      }
      // Update in friends list
      setFriends((prev) =>
        prev.map((f) =>
          f.username === updated.username
            ? {
                ...f,
                followersCount: updated.followersCount,
                followingCount: updated.followingCount,
              }
            : f
        )
      );
    };

    socket.on("message:new", handleNewMessage);
    socket.on("user:updated", handleUserUpdated);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("user:updated", handleUserUpdated);
    };
  }, [socket, user, refreshUser]);

  const handlePostMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || sending) return;

    setSending(true);
    try {
      await api.sendMessage({ to: "all", content: newContent.trim() });
      setNewContent("");
    } catch (err: any) {
      alert(err.message || "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Real-time Ticker */}
      <KivaEventTicker />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Center: Main Stream (Order-1 on mobile so users see posts immediately) */}
        <div className="order-1 lg:order-2 lg:col-span-2 space-y-6">
          {/* Create Post / Message Form */}
          <Card className="border-slate-800/90 shadow-xl bg-slate-900/70 backdrop-blur-xl">
            <form onSubmit={handlePostMessage}>
              <div className="flex items-start gap-3">
                <Avatar src={user.avatar} fallback={user.username} size="md" className="ring-2 ring-indigo-500/30" />
                <div className="flex-1">
                  <textarea
                    rows={3}
                    placeholder="Quoi de neuf dans la communauté KivaSocial ? (enregistré dans KivaDB sous msg:<id>)"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 focus:border-indigo-500/50 resize-none transition-all"
                    required
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-800/60">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                      Diffusion temps réel via <span className="text-indigo-300 font-semibold">KivaDB WebSocket</span>
                    </span>
                    <Button type="submit" size="sm" className="gap-2 self-end sm:self-auto shadow-md shadow-indigo-500/20" isLoading={sending}>
                      <Send className="h-3.5 w-3.5" />
                      Publier
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </Card>

          {/* Feed Stream */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
                Fil d&apos;actualité en direct ({messages.length})
              </h3>
              <Badge variant="live">Temps réel actif</Badge>
            </div>

            {messages.length === 0 ? (
              <Card className="text-center py-12 text-slate-400">
                <MessageSquare className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="font-medium text-white">Aucun message pour l&apos;instant</p>
                <p className="text-xs text-slate-400 mt-1">
                  Soyez le premier à envoyer un message enregistré dans KivaDB !
                </p>
              </Card>
            ) : (
              [...messages].reverse().map((msg) => (
                <Card
                  key={msg.id}
                  className="border-slate-800/80 hover:border-slate-700/80 transition-all p-4 sm:p-5 shadow-lg bg-slate-900/60 backdrop-blur-md group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/profile/${msg.from}`}>
                        <Avatar
                          fallback={msg.from}
                          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${msg.from}`}
                          size="md"
                          className="ring-2 ring-indigo-500/20 group-hover:ring-indigo-500/50 transition-all"
                        />
                      </Link>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/profile/${msg.from}`}
                            className="font-bold text-white text-sm hover:text-indigo-300 transition-colors"
                          >
                            @{msg.from}
                          </Link>
                          {msg.to && msg.to !== "all" && (
                            <span className="text-xs text-slate-400">
                              → à <span className="text-indigo-400 font-semibold">@{msg.to}</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px] hidden sm:inline-flex">
                      msg:{msg.id.substring(0, 8)}...
                    </Badge>
                  </div>

                  <p className="text-sm text-slate-200 mt-3.5 leading-relaxed whitespace-pre-wrap pl-0 sm:pl-12">
                    {msg.content}
                  </p>

                  {/* Quick Card Footer with DM action */}
                  <div className="mt-3.5 pt-2.5 border-t border-slate-800/60 flex items-center justify-between pl-0 sm:pl-12 text-xs">
                    <span className="font-mono text-[10px] text-slate-500">
                      ID: {msg.id.substring(0, 10)}
                    </span>
                    {msg.from !== user.username && (
                      <Link
                        href={`/messages?with=${msg.from}`}
                        className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors font-medium text-xs"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Discuter en privé
                      </Link>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Left Column: User Profile Card (Order-2 on mobile, Order-1 on desktop) */}
        <div className="order-2 lg:order-1 space-y-6">
          <Card className="border-slate-800/90 text-center relative overflow-hidden bg-slate-900/70 backdrop-blur-xl">
            <div className="h-20 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 -mx-6 -mt-6 mb-4" />
            <div className="relative -mt-14 mb-3 flex justify-center">
              <Avatar
                src={user.avatar}
                fallback={user.username}
                size="xl"
                className="ring-4 ring-slate-900 shadow-xl"
              />
            </div>

            <h2 className="text-lg font-bold text-white">{user.displayName}</h2>
            <p className="text-xs text-indigo-400 font-mono">@{user.username}</p>
            <p className="text-xs text-slate-400 mt-2 line-clamp-2 px-2">{user.bio}</p>

            {/* Dynamic Counters */}
            <div className="grid grid-cols-2 gap-2 mt-6 pt-4 border-t border-slate-800/80">
              <Link
                href={`/profile/${user.username}`}
                className="p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
              >
                <div className="text-xl font-extrabold text-white">{user.followersCount}</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Abonnés</div>
              </Link>
              <Link
                href={`/profile/${user.username}`}
                className="p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
              >
                <div className="text-xl font-extrabold text-white">{user.followingCount}</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Abonnements</div>
              </Link>
            </div>

            <div className="mt-4">
              <Link href={`/profile/${user.username}`}>
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                  Voir mon profil complet
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Quick Stats on KivaDB */}
          <Card className="border-slate-800/90 p-4 bg-slate-900/70 backdrop-blur-xl">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-400" />
              Stockage KivaDB
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Workspace actif :</span>
                <span className="font-mono text-indigo-300 font-medium">social_app</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Clé utilisateur :</span>
                <span className="font-mono text-indigo-300">user:{user.username}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Port binaire / REST :</span>
                <span className="font-mono text-emerald-400">2911 / 8080</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Suggested Friends & Community (Order-3) */}
        <div className="order-3 space-y-6">
          <Card className="border-slate-800/90 p-4 bg-slate-900/70 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-400" />
                Membres récents
              </h3>
              <Link href="/friends" className="text-xs text-indigo-400 hover:underline">
                Voir tout ({friends.length})
              </Link>
            </div>

            <div className="space-y-3">
              {friends
                .filter((f) => f.username !== user.username)
                .slice(0, 5)
                .map((member) => (
                  <div
                    key={member.username}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 hover:bg-slate-800/50 transition-colors"
                  >
                    <Link
                      href={`/profile/${member.username}`}
                      className="flex items-center gap-2.5 truncate"
                    >
                      <Avatar src={member.avatar} fallback={member.username} size="sm" />
                      <div className="truncate text-left">
                        <p className="text-xs font-semibold text-white truncate">
                          {member.displayName}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {member.followersCount} abonnés
                        </p>
                      </div>
                    </Link>

                    <Link href={`/profile/${member.username}`}>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        Profil
                      </Button>
                    </Link>
                  </div>
                ))}

              {friends.length <= 1 && (
                <p className="text-xs text-slate-400 text-center py-4">
                  Aucun autre utilisateur pour le moment. Créez un compte supplémentaire pour tester le réseau !
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
