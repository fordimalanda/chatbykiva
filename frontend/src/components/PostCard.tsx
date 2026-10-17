"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, CommentItem, PostItem } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn, timeAgo } from "@/lib/utils";
import { useSocket } from "@/context/SocketContext";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { Heart, MessageCircle, MessageSquare, MoreHorizontal, Pencil, Send, Trash2, X } from "lucide-react";

/** Rend #hashtags et @mentions cliquables */
export function RichText({ text, onTagClick }: { text: string; onTagClick?: (tag: string) => void }) {
  const parts = text.split(/([#@][\p{L}0-9_-]{2,40})/u);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("#") && part.length > 2) {
          const tag = part.slice(1).toLowerCase();
          return (
            <button
              key={i}
              type="button"
              onClick={() => onTagClick?.(tag)}
              className="font-semibold text-indigo-300 hover:underline"
            >
              {part}
            </button>
          );
        }
        if (part.startsWith("@") && part.length > 2) {
          return (
            <Link key={i} href={`/profile/${part.slice(1).toLowerCase()}`} className="font-semibold text-amber-300 hover:underline">
              {part}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

interface PostCardProps {
  post: PostItem;
  currentUsername: string;
  onChange: (post: PostItem) => void;
  onDeleted: (id: string) => void;
  onTagClick?: (tag: string) => void;
  highlighted?: boolean;
}

export function PostCard({ post, currentUsername, onChange, onDeleted, onTagClick, highlighted }: PostCardProps) {
  const { socket, isOnline } = useSocket();
  const isAuthor = post.author === currentUsername;
  const hasLiked = (post.likes || []).includes(currentUsername);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content);
  const [saving, setSaving] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  // Commentaires en temps réel quand le fil est ouvert
  useEffect(() => {
    if (!socket || !showComments) return;
    const onComment = (c: CommentItem) => {
      if (c.postId !== post.id) return;
      setComments((prev) => (prev && !prev.some((x) => x.id === c.id) ? [...prev, c] : prev));
    };
    const onCommentDeleted = ({ postId, id }: { postId: string; id: string }) => {
      if (postId !== post.id) return;
      setComments((prev) => prev?.filter((c) => c.id !== id) || prev);
    };
    socket.on("post:comment", onComment);
    socket.on("post:comment_deleted", onCommentDeleted);
    return () => {
      socket.off("post:comment", onComment);
      socket.off("post:comment_deleted", onCommentDeleted);
    };
  }, [socket, showComments, post.id]);

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) {
      setComments(await api.getComments(post.id));
    }
  };

  const handleLike = async () => {
    const nextLikes = hasLiked
      ? post.likes.filter((u) => u !== currentUsername)
      : [...(post.likes || []), currentUsername];
    if (!hasLiked) {
      setLikeBurst(true);
      setTimeout(() => setLikeBurst(false), 400);
    }
    onChange({ ...post, likes: nextLikes, likesCount: nextLikes.length });
    try {
      onChange(await api.toggleLikePost(post.id));
    } catch (err: any) {
      onChange(post);
      toast.error(err.message || "Impossible d'aimer cette publication");
    }
  };

  const handleSaveEdit = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      onChange(await api.updatePost(post.id, draft.trim()));
      setEditing(false);
      toast.success("Publication modifiée");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!confirm("Supprimer définitivement cette publication et ses commentaires ?")) return;
    if (await api.deletePost(post.id)) {
      onDeleted(post.id);
      toast.success("Publication supprimée");
    } else {
      toast.error("Suppression impossible");
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentDraft.trim();
    if (!text || sendingComment) return;
    setSendingComment(true);
    try {
      const created = await api.addComment(post.id, text);
      setCommentDraft("");
      setComments((prev) => (prev && !prev.some((c) => c.id === created.id) ? [...prev, created] : prev || [created]));
      onChange({ ...post, commentsCount: (post.commentsCount || 0) + 1 });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeleteComment = async (c: CommentItem) => {
    try {
      await api.deleteComment(post.id, c.id);
      setComments((prev) => prev?.filter((x) => x.id !== c.id) || prev);
      onChange({ ...post, commentsCount: Math.max(0, (post.commentsCount || 1) - 1) });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <article
      id={`post-${post.id}`}
      className={cn(
        "rounded-2xl border bg-slate-900/70 p-4 shadow-lg backdrop-blur-md transition-all animate-fade-up sm:p-5",
        highlighted ? "border-indigo-500/60 ring-2 ring-indigo-500/30" : "border-slate-800/80 hover:border-slate-700/80"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <Link href={`/profile/${post.author}`} className="flex min-w-0 items-center gap-3">
          <Avatar src={post.avatar} fallback={post.author} size="md" online={isOnline(post.author)} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white hover:text-indigo-300">{post.displayName || post.author}</p>
            <p className="truncate text-xs text-slate-400">
              <span className="font-mono text-indigo-400">@{post.author}</span>
              <span className="mx-1.5 text-slate-600">·</span>
              <time dateTime={new Date(post.timestamp).toISOString()} title={new Date(post.timestamp).toLocaleString()}>
                {timeAgo(post.timestamp)}
              </time>
              {post.editedAt && <span className="ml-1 text-slate-500">(modifié)</span>}
            </p>
          </div>
        </Link>

        {isAuthor && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Options de la publication"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl animate-fade-up">
                <button
                  onClick={() => {
                    setDraft(post.content);
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" /> Modifier
                </button>
                <button
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={1000}
            className="w-full resize-none rounded-xl border border-slate-700/80 bg-slate-950/70 p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleSaveEdit} isLoading={saving}>
              Enregistrer
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-200 sm:text-sm">
          <RichText text={post.content} onTagClick={onTagClick} />
        </p>
      )}

      {/* Interaction Bar */}
      <div className="mt-4 flex items-center gap-1 border-t border-slate-800/60 pt-2.5 text-xs">
        <button
          onClick={handleLike}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all",
            hasLiked ? "bg-rose-500/15 font-semibold text-rose-400" : "text-slate-400 hover:bg-slate-800/60 hover:text-rose-400"
          )}
          aria-pressed={hasLiked}
        >
          <Heart className={cn("h-4 w-4 transition-transform", hasLiked && "fill-rose-400", likeBurst && "scale-125")} />
          <span>{post.likesCount || 0}</span>
        </button>

        <button
          onClick={toggleComments}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 transition-all",
            showComments ? "bg-sky-500/10 text-sky-300" : "text-slate-400 hover:bg-slate-800/60 hover:text-sky-300"
          )}
          aria-expanded={showComments}
        >
          <MessageCircle className="h-4 w-4" />
          <span>{post.commentsCount || 0}</span>
          <span className="hidden xs:inline">commentaire{(post.commentsCount || 0) > 1 ? "s" : ""}</span>
        </button>

        {!isAuthor && (
          <Link
            href={`/messages?with=${post.author}`}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-indigo-300"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Message privé</span>
          </Link>
        )}
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 space-y-3 border-t border-slate-800/60 pt-3">
          {comments === null ? (
            <div className="space-y-2">
              <div className="skeleton h-10" />
              <div className="skeleton h-10 w-2/3" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-1 text-center text-xs text-slate-500">Aucun commentaire. Lancez la discussion !</p>
          ) : (
            <ul className="space-y-2.5">
              {comments.map((c) => (
                <li key={c.id} className="group flex items-start gap-2.5">
                  <Link href={`/profile/${c.author}`}>
                    <Avatar src={c.avatar} fallback={c.author} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-slate-800/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/profile/${c.author}`} className="truncate text-xs font-bold text-white hover:underline">
                        {c.displayName}
                      </Link>
                      <span className="shrink-0 text-[10px] text-slate-500">{timeAgo(c.timestamp)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-200">
                      <RichText text={c.content} onTagClick={onTagClick} />
                    </p>
                  </div>
                  {(c.author === currentUsername || isAuthor) && (
                    <button
                      onClick={() => handleDeleteComment(c)}
                      className="mt-1 rounded-md p-1 text-slate-500 opacity-100 transition-opacity hover:text-rose-400 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Supprimer le commentaire"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddComment} className="flex items-center gap-2">
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              maxLength={500}
              placeholder="Écrire un commentaire…"
              className="h-10 flex-1 rounded-full border border-slate-700/80 bg-slate-950/70 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              disabled={!commentDraft.trim()}
              isLoading={sendingComment}
              aria-label="Envoyer le commentaire"
            >
              {!sendingComment && <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      )}
    </article>
  );
}
