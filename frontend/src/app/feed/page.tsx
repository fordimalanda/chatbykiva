"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api, PostItem, UserSummaryItem } from "@/lib/api";
import { Card } from "@/components/ui/Card";
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
  Heart,
  Trash2,
  Share2,
} from "lucide-react";

export default function FeedPage() {
  const { user, loading, refreshUser } = useAuth();
  const { socket } = useSocket();
  const router = useRouter();

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [friends, setFriends] = useState<UserSummaryItem[]>([]);
  const [newContent, setNewContent] = useState("");
  const [sending, setSending] = useState(false);
  const [likeLoading, setLikeLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    // Fetch initial social publications and members
    api.getPosts().then(setPosts).catch(console.error);
    api.getUsers().then(setFriends).catch(console.error);
  }, [user]);

  // Real-time synchronization via KivaDB WebSocket bridge
  useEffect(() => {
    if (!socket) return;

    const handleNewPost = (post: PostItem) => {
      setPosts((prev) => {
        if (prev.some((p) => p.id === post.id)) return prev;
        return [post, ...prev];
      });
    };

    const handlePostUpdated = (updated: PostItem) => {
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    };

    const handlePostDeleted = ({ id }: { id: string }) => {
      setPosts((prev) => prev.filter((p) => p.id !== id));
    };

    const handleUserUpdated = (updated: any) => {
      if (user && updated.username === user.username) {
        refreshUser();
      }
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

    socket.on("post:new", handleNewPost);
    socket.on("post:updated", handlePostUpdated);
    socket.on("post:deleted", handlePostDeleted);
    socket.on("user:updated", handleUserUpdated);

    return () => {
      socket.off("post:new", handleNewPost);
      socket.off("post:updated", handlePostUpdated);
      socket.off("post:deleted", handlePostDeleted);
      socket.off("user:updated", handleUserUpdated);
    };
  }, [socket, user, refreshUser]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || sending) return;

    const text = newContent.trim();
    setSending(true);
    try {
      const created = await api.createPost(text);
      setNewContent("");
      // Immediate local state update for instant UX
      setPosts((prev) => {
        if (prev.some((p) => p.id === created.id)) return prev;
        return [created, ...prev];
      });
    } catch (err: any) {
      alert(err.message || "Erreur lors de la publication");
    } finally {
      setSending(false);
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!user) return;

    setLikeLoading((prev) => ({ ...prev, [postId]: true }));

    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const hasLiked = (p.likes || []).includes(user.username);
          const nextLikes = hasLiked
            ? (p.likes || []).filter((u) => u !== user.username)
            : [...(p.likes || []), user.username];
          return {
            ...p,
            likes: nextLikes,
            likesCount: nextLikes.length,
          };
        }
        return p;
      })
    );

    try {
      const updated = await api.toggleLikePost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLikeLoading((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Voulez-vous supprimer cette publication de KivaDB ?")) return;

    try {
      await api.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err: any) {
      alert(err.message || "Erreur de suppression");
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
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* Real-time Ticker */}
      <KivaEventTicker />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Center Stream: Publications & Posts (Order-1 on mobile) */}
        <div className="order-1 lg:order-2 lg:col-span-2 space-y-5">
          {/* Create Post Form */}
          <Card className="border-slate-800/90 shadow-xl bg-slate-900/80 backdrop-blur-xl p-4 sm:p-5">
            <form onSubmit={handleCreatePost}>
              <div className="flex items-start gap-3">
                <Avatar src={user.avatar} fallback={user.username} size="md" className="ring-2 ring-indigo-500/30" />
                <div className="flex-1">
                  <textarea
                    rows={3}
                    placeholder={`Quoi de neuf, ${user.displayName || user.username} ? Partagez une publication avec la communauté...`}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-950/70 p-3 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 resize-none transition-all"
                    required
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-800/60">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                      Publication enregistrée sous <code className="text-indigo-300 font-mono">post:&lt;id&gt;</code>
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

          {/* Posts Stream */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
                Actualités de la communauté ({posts.length})
              </h2>
              <Badge variant="live">Temps réel KivaDB</Badge>
            </div>

            {posts.length === 0 ? (
              <Card className="text-center py-12 text-slate-400 bg-slate-900/60">
                <Sparkles className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="font-bold text-white text-base">Aucune publication pour le moment</p>
                <p className="text-xs text-slate-400 mt-1">
                  Soyez le premier à partager une actualité dans la communauté !
                </p>
              </Card>
            ) : (
              posts.map((post) => {
                const hasLiked = user ? (post.likes || []).includes(user.username) : false;
                const isAuthor = user ? post.author === user.username : false;

                return (
                  <Card
                    key={post.id}
                    className="border-slate-800/80 hover:border-slate-700/80 transition-all p-4 sm:p-5 shadow-lg bg-slate-900/70 backdrop-blur-md"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/profile/${post.author}`}>
                          <Avatar
                            fallback={post.author}
                            src={post.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.author}`}
                            size="md"
                            className="ring-2 ring-indigo-500/20 hover:ring-indigo-500/50 transition-all"
                          />
                        </Link>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/profile/${post.author}`}
                              className="font-bold text-white text-sm hover:text-indigo-300 transition-colors"
                            >
                              {post.displayName || post.author}
                            </Link>
                            <span className="text-xs text-indigo-400 font-mono">@{post.author}</span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {formatTime(post.timestamp)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="font-mono text-[10px] hidden sm:inline-flex">
                          post:{post.id.substring(0, 8)}...
                        </Badge>
                        {isAuthor && (
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Supprimer la publication"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <p className="text-sm text-slate-200 mt-3.5 leading-relaxed whitespace-pre-wrap pl-0 sm:pl-12">
                      {post.content}
                    </p>

                    {/* Interaction Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between pl-0 sm:pl-12 text-xs">
                      <div className="flex items-center gap-4">
                        {/* Like button */}
                        <button
                          onClick={() => handleToggleLike(post.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                            hasLiked
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold"
                              : "text-slate-400 hover:text-rose-400 hover:bg-slate-800/60"
                          }`}
                        >
                          <Heart
                            className={`h-4 w-4 ${hasLiked ? "fill-rose-400 text-rose-400" : ""}`}
                          />
                          <span>{post.likesCount || 0}</span>
                        </button>

                        {/* Send DM button */}
                        {!isAuthor && (
                          <Link
                            href={`/messages?with=${post.author}`}
                            className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors py-1.5 px-2 rounded-lg hover:bg-slate-800/60"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Discuter en privé</span>
                          </Link>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-500 font-mono">
                        KivaDB NoSQL
                      </span>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Left Column: User Profile Card (Order-2 on mobile, Order-1 on desktop) */}
        <div className="order-2 lg:order-1 space-y-5">
          <Card className="border-slate-800/90 text-center relative overflow-hidden bg-slate-900/80 backdrop-blur-xl">
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

            {/* Counters */}
            <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-800/80">
              <Link
                href={`/profile/${user.username}`}
                className="p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
              >
                <div className="text-xl font-black text-white">{user.followersCount}</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Abonnés</div>
              </Link>
              <Link
                href={`/profile/${user.username}`}
                className="p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
              >
                <div className="text-xl font-black text-white">{user.followingCount}</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Abonnements</div>
              </Link>
            </div>

            <div className="mt-4">
              <Link href={`/profile/${user.username}`}>
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                  Mon profil complet
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Quick Access to Chat */}
          <Card className="border-slate-800/90 p-4 bg-slate-900/80 backdrop-blur-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-400" />
              Messagerie & Salons
            </h3>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Pour discuter en direct dans le Salon Général ou envoyer des messages privés, rendez-vous sur la messagerie.
            </p>
            <Link href="/messages">
              <Button size="sm" className="w-full gap-2 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                Ouvrir les messages
              </Button>
            </Link>
          </Card>
        </div>

        {/* Right Column: Suggested Members (Order-3) */}
        <div className="order-3 space-y-5">
          <Card className="border-slate-800/90 p-4 bg-slate-900/80 backdrop-blur-xl">
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
                  Aucun autre utilisateur pour le moment.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
