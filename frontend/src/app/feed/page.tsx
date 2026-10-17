"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api, FeedScope, PostItem, SuggestionItem } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { KivaEventTicker } from "@/components/KivaEventTicker";
import { PostCard } from "@/components/PostCard";
import { Users, MessageSquare, Send, Sparkles, Hash, TrendingUp, UserPlus, X, Radio } from "lucide-react";

const MAX_POST = 1000;

export default function FeedPage() {
  const { user, loading } = useAuth();
  const { socket, onlineUsers, isOnline } = useSocket();
  const router = useRouter();

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [scope, setScope] = useState<FeedScope>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [trending, setTrending] = useState<Array<{ tag: string; count: number }>>([]);
  const [newContent, setNewContent] = useState("");
  const [sending, setSending] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [freshCount, setFreshCount] = useState(0);
  const [composerFocused, setComposerFocused] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const loadFeed = useCallback(async () => {
    setPostsLoading(true);
    try {
      setPosts(await api.getFeed({ scope, tag: tag || undefined }));
      setFreshCount(0);
    } finally {
      setPostsLoading(false);
    }
  }, [scope, tag]);

  useEffect(() => {
    if (user) loadFeed();
  }, [user?.username, loadFeed]);

  useEffect(() => {
    if (!user) return;
    api.getSuggestions().then(setSuggestions).catch(console.error);
    api.getTrending().then(setTrending).catch(console.error);
  }, [user?.username]);

  // Lien profond depuis une notification : /feed#post-<id>
  useEffect(() => {
    if (postsLoading || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#post-")) return;
    const id = hash.replace("#post-", "");
    setHighlightId(id);
    document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
  }, [postsLoading]);

  // Real-time synchronization via KivaDB WebSocket bridge
  useEffect(() => {
    if (!socket || !user) return;

    const matchesFilters = (post: PostItem) => {
      if (tag && !(post.hashtags || []).includes(tag)) return false;
      return true;
    };

    const handleNewPost = (post: PostItem) => {
      if (!matchesFilters(post)) return;
      setPosts((prev) => {
        if (prev.some((p) => p.id === post.id)) return prev;
        if (post.author !== user.username && window.scrollY > 400) setFreshCount((c) => c + 1);
        return [post, ...prev];
      });
    };
    const handlePostUpdated = (updated: PostItem) => {
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    };
    const handlePostDeleted = ({ id }: { id: string }) => {
      setPosts((prev) => prev.filter((p) => p.id !== id));
    };

    socket.on("post:new", handleNewPost);
    socket.on("post:updated", handlePostUpdated);
    socket.on("post:deleted", handlePostDeleted);
    return () => {
      socket.off("post:new", handleNewPost);
      socket.off("post:updated", handlePostUpdated);
      socket.off("post:deleted", handlePostDeleted);
    };
  }, [socket, user, tag]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newContent.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const created = await api.createPost(text);
      setNewContent("");
      setPosts((prev) => (prev.some((p) => p.id === created.id) ? prev : [created, ...prev]));
      toast.success("Publication partagée");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la publication");
    } finally {
      setSending(false);
    }
  };

  const handleFollowSuggestion = async (username: string) => {
    try {
      await api.toggleFollow(username);
      setSuggestions((prev) => prev.filter((s) => s.username !== username));
      toast.success(`Vous suivez maintenant @${username}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const selectTag = (t: string | null) => {
    setTag(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  const remaining = MAX_POST - newContent.length;
  const firstName = (user.displayName || user.username).split(" ")[0];
  const composerOpen = composerFocused || newContent.length > 0;
  const onlineFriends = Array.from(onlineUsers).filter((u) => u !== user.username);

  return (
    <div className="page-container space-y-4 sm:space-y-5">
      <div className="hidden sm:block">
        <KivaEventTicker />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Left column: profile + online (desktop) */}
        <aside className="hidden space-y-5 lg:block">
          <Card className="relative overflow-hidden p-0 text-center">
            <div className="h-16 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600" />
            <div className="-mt-10 flex justify-center">
              <Avatar src={user.avatar} fallback={user.username} size="xl" className="ring-4 ring-slate-900" />
            </div>
            <div className="px-5 pb-5 pt-3">
              <h2 className="truncate text-base font-bold text-white">{user.displayName}</h2>
              <p className="font-mono text-xs text-indigo-400">@{user.username}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-4">
                <Link href={`/profile/${user.username}`} className="rounded-xl bg-slate-800/40 p-2 hover:bg-slate-800/70">
                  <div className="text-lg font-black text-white">{user.followersCount}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Abonnés</div>
                </Link>
                <Link href={`/profile/${user.username}`} className="rounded-xl bg-slate-800/40 p-2 hover:bg-slate-800/70">
                  <div className="text-lg font-black text-white">{user.followingCount}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Abonnements</div>
                </Link>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              En ligne ({onlineFriends.length})
            </h3>
            {onlineFriends.length === 0 ? (
              <p className="text-xs text-slate-500">Personne d&apos;autre n&apos;est connecté pour l&apos;instant.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {onlineFriends.slice(0, 12).map((u) => (
                  <Link key={u} href={`/messages?with=${u}`} title={`Écrire à @${u}`}>
                    <Avatar src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u}`} fallback={u} size="md" online />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </aside>

        {/* Center: composer + feed */}
        <section className="min-w-0 space-y-4">
          <Card className="p-3 sm:p-4">
            <form onSubmit={handleCreatePost} className="flex items-start gap-3">
              <Avatar src={user.avatar} fallback={user.username} size="md" className="hidden xs:flex" />
              <div className="min-w-0 flex-1">
                <textarea
                  rows={composerOpen ? 4 : 1}
                  maxLength={MAX_POST}
                  placeholder={`Quoi de neuf, ${firstName} ?`}
                  value={newContent}
                  onFocus={() => setComposerFocused(true)}
                  onBlur={() => setComposerFocused(false)}
                  onChange={(e) => setNewContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCreatePost(e);
                  }}
                  className="block min-h-[44px] w-full resize-none rounded-xl border border-slate-700/80 bg-slate-950/70 px-3.5 py-2.5 text-sm leading-6 text-slate-100 transition-all placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      remaining < 50 ? "text-amber-400" : "text-slate-500",
                      remaining < 0 && "text-rose-400"
                    )}
                  >
                    {newContent ? `${remaining} caractères restants` : composerOpen ? "#hashtags · @mentions" : "Partagez une actualité"}
                  </span>
                  <Button type="submit" size="sm" className="gap-2" isLoading={sending} disabled={!newContent.trim()}>
                    <Send className="h-3.5 w-3.5" />
                    Publier
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {/* Feed tabs */}
          <div className="sticky top-[calc(var(--header-h)+var(--safe-top))] z-20 -mx-3 flex items-center gap-2 bg-slate-950/85 px-3 py-2 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:border-slate-800/70 sm:px-2">
            {(
              [
                { id: "all", label: "Pour vous" },
                { id: "following", label: "Abonnements" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setScope(t.id)}
                className={cn(
                  "rounded-xl px-4 py-1.5 text-sm font-semibold transition-all",
                  scope === t.id ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                {t.label}
              </button>
            ))}
            {tag && (
              <button
                onClick={() => selectTag(null)}
                className="ml-auto flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-200"
              >
                #{tag}
                <X className="h-3 w-3" />
              </button>
            )}
            {!tag && (
              <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-emerald-400 sm:flex">
                <Radio className="h-3.5 w-3.5 animate-pulse" /> Temps réel
              </span>
            )}
          </div>

          {freshCount > 0 && (
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setFreshCount(0);
              }}
              className="sticky top-[calc(var(--header-h)+var(--safe-top)+3.5rem)] z-20 mx-auto block rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/30 animate-fade-up"
            >
              ↑ {freshCount} nouvelle{freshCount > 1 ? "s" : ""} publication{freshCount > 1 ? "s" : ""}
            </button>
          )}

          {/* Découverte mobile/tablette : tendances + suggestions en défilement horizontal */}
          {(trending.length > 0 || suggestions.length > 0) && !tag && (
            <div className="space-y-3 xl:hidden">
              {trending.length > 0 && (
                <div className="scrollbar-none -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-400">
                    <TrendingUp className="h-3.5 w-3.5 text-indigo-400" /> Tendances
                  </span>
                  {trending.map((t) => (
                    <button
                      key={t.tag}
                      onClick={() => selectTag(t.tag)}
                      className="shrink-0 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-200 active:scale-95"
                    >
                      #{t.tag}
                    </button>
                  ))}
                </div>
              )}
              {suggestions.length > 0 && (
                <div className="scrollbar-none -mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0">
                  {suggestions.map((s) => (
                    <div
                      key={s.username}
                      className="flex w-36 shrink-0 snap-start flex-col items-center rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3 text-center"
                    >
                      <Link href={`/profile/${s.username}`} className="flex min-w-0 flex-col items-center">
                        <Avatar src={s.avatar} fallback={s.username} size="lg" online={isOnline(s.username)} />
                        <p className="mt-2 w-full truncate text-xs font-bold text-white">{s.displayName}</p>
                        <p className="w-full truncate text-[10px] text-slate-400">
                          {s.mutualCount > 0 ? `${s.mutualCount} ami${s.mutualCount > 1 ? "s" : ""} en commun` : `@${s.username}`}
                        </p>
                      </Link>
                      <Button size="sm" className="mt-2.5 h-8 w-full text-xs" onClick={() => handleFollowSuggestion(s.username)}>
                        Suivre
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {postsLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5">
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-3 w-1/3" />
                      <div className="skeleton h-2.5 w-1/4" />
                    </div>
                  </div>
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <Card className="py-12 text-center">
              <Sparkles className="mx-auto mb-3 h-10 w-10 text-slate-600" />
              <p className="text-base font-bold text-white">
                {scope === "following" ? "Rien de neuf chez vos abonnements" : tag ? `Aucune publication #${tag}` : "Aucune publication pour le moment"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {scope === "following"
                  ? "Suivez des membres pour remplir ce fil."
                  : "Soyez le premier à partager une actualité !"}
              </p>
              {scope === "following" && (
                <Link href="/friends">
                  <Button size="sm" variant="outline" className="mt-4 gap-2">
                    <Users className="h-3.5 w-3.5" /> Découvrir des membres
                  </Button>
                </Link>
              )}
            </Card>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUsername={user.username}
                  highlighted={highlightId === post.id}
                  onTagClick={selectTag}
                  onChange={(updated) => setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
                  onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
                />
              ))}
            </div>
          )}
        </section>

        {/* Right column: trending + suggestions */}
        <aside className="hidden space-y-5 xl:block">
          {trending.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                Tendances de la semaine
              </h3>
              <div className="flex flex-wrap gap-2">
                {trending.map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => selectTag(t.tag)}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      tag === t.tag
                        ? "border-indigo-500/60 bg-indigo-500/20 text-indigo-200"
                        : "border-slate-700 bg-slate-800/50 text-slate-300 hover:border-indigo-500/40 hover:text-white"
                    )}
                  >
                    <Hash className="h-3 w-3" />
                    {t.tag}
                    <span className="text-slate-500">{t.count}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <UserPlus className="h-4 w-4 text-indigo-400" />
                Suggestions
              </h3>
              <Link href="/friends" className="text-xs text-indigo-400 hover:underline">
                Voir tout
              </Link>
            </div>
            {suggestions.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-400">Vous suivez déjà tout le monde 🎉</p>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.username} className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-slate-800/40">
                    <Link href={`/profile/${s.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Avatar src={s.avatar} fallback={s.username} size="sm" online={isOnline(s.username)} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white">{s.displayName}</p>
                        <p className="truncate text-[10px] text-slate-400">
                          {s.mutualCount > 0
                            ? `Suivi par @${s.mutuals[0]}${s.mutualCount > 1 ? ` +${s.mutualCount - 1}` : ""}`
                            : `${s.followersCount} abonné${s.followersCount > 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </Link>
                    <Button size="sm" variant="secondary" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => handleFollowSuggestion(s.username)}>
                      Suivre
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="hidden p-4 xl:block">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <MessageSquare className="h-4 w-4 text-indigo-400" />
              Messagerie & Salons
            </h3>
            <p className="mb-3 text-xs leading-relaxed text-slate-400">
              Discutez en direct dans les salons de vos communautés ou en privé.
            </p>
            <Link href="/messages">
              <Button size="sm" className="w-full gap-2 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                Ouvrir les messages
              </Button>
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
