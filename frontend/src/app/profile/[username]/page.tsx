"use client";

import { useEffect, useRef, useState, use, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api, PostItem, UserProfile, UserSummaryItem } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn, formatDate, lastSeenLabel } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { PostCard } from "@/components/PostCard";
import {
  UserCheck,
  UserPlus,
  MessageSquare,
  Database,
  Calendar,
  Code,
  ArrowLeft,
  Pencil,
  KeyRound,
  LogOut,
  Upload,
  Sparkles,
} from "lucide-react";

type Tab = "posts" | "followers" | "following" | "kivadb";

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const targetUsername = resolvedParams.username.toLowerCase();

  const { user: currentUser, setUser, logout } = useAuth();
  const { socket, isOnline, lastSeen } = useSocket();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [directory, setDirectory] = useState<Record<string, UserSummaryItem>>({});
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("posts");

  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setProfile(await api.getProfile(targetUsername));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [targetUsername]);

  useEffect(() => {
    setLoading(true);
    fetchProfile();
    api.getFeed({ author: targetUsername }).then(setPosts).catch(console.error);
    api
      .getUsers()
      .then((list) => setDirectory(Object.fromEntries(list.map((u) => [u.username, u]))))
      .catch(console.error);
  }, [targetUsername, currentUser?.username, fetchProfile]);

  // Real-time synchronization: followers/following & profile edits from KivaDB
  useEffect(() => {
    if (!socket) return;

    const handleUserUpdated = (updated: any) => {
      if (updated.username !== targetUsername) return;
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              displayName: updated.displayName || prev.displayName,
              avatar: updated.avatar || prev.avatar,
              bio: updated.bio ?? prev.bio,
              followers: updated.followers || [],
              following: updated.following || [],
              followersCount: updated.followersCount,
              followingCount: updated.followingCount,
              isFollowing: currentUser ? (updated.followers || []).includes(currentUser.username) : prev.isFollowing,
            }
          : prev
      );
    };
    const handleNewPost = (post: PostItem) => {
      if (post.author === targetUsername) setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
    };
    const handlePostDeleted = ({ id }: { id: string }) => setPosts((prev) => prev.filter((p) => p.id !== id));

    socket.on("user:updated", handleUserUpdated);
    socket.on("post:new", handleNewPost);
    socket.on("post:deleted", handlePostDeleted);
    return () => {
      socket.off("user:updated", handleUserUpdated);
      socket.off("post:new", handleNewPost);
      socket.off("post:deleted", handlePostDeleted);
    };
  }, [socket, targetUsername, currentUser]);

  const handleToggleFollow = async () => {
    if (!currentUser || !profile) return;
    setFollowLoading(true);
    const wasFollowing = profile.isFollowing;
    setProfile({
      ...profile,
      isFollowing: !wasFollowing,
      followersCount: Math.max(0, profile.followersCount + (wasFollowing ? -1 : 1)),
    });
    try {
      const res = await api.toggleFollow(targetUsername);
      setProfile((prev) => (prev ? { ...prev, isFollowing: res.following, followersCount: res.followersCount } : prev));
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la modification du suivi");
      fetchProfile();
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container max-w-5xl space-y-4">
        <div className="skeleton h-40 rounded-2xl sm:h-48" />
        <div className="flex items-end gap-4 px-4">
          <div className="skeleton -mt-16 h-24 w-24 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-white">Utilisateur introuvable</h2>
        <p className="text-slate-400">
          La clé <code className="font-mono text-indigo-400">user:{targetUsername}</code> n&apos;existe pas dans le workspace
          social_app de KivaDB.
        </p>
        <Link href="/friends">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour à la communauté
          </Button>
        </Link>
      </div>
    );
  }

  const isMe = currentUser?.username === targetUsername;
  const online = isMe || isOnline(targetUsername);
  const isMutual = profile.isFollowing && profile.followsYou;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "posts", label: `Publications (${posts.length})` },
    { id: "followers", label: `Abonnés (${profile.followersCount})` },
    { id: "following", label: `Abonnements (${profile.followingCount})` },
    { id: "kivadb", label: "Document KivaDB" },
  ];

  const renderUserList = (usernames: string[], empty: string) =>
    usernames.length === 0 ? (
      <p className="py-8 text-center text-sm text-slate-400">{empty}</p>
    ) : (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {usernames.map((u) => {
          const info = directory[u];
          return (
            <Link
              key={u}
              href={`/profile/${u}`}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 transition-colors hover:bg-slate-800/50"
            >
              <Avatar src={info?.avatar} fallback={u} size="md" online={isOnline(u)} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{info?.displayName || u}</p>
                <p className="truncate font-mono text-xs text-indigo-400">@{u}</p>
              </div>
            </Link>
          );
        })}
      </div>
    );

  return (
    <div className="page-container max-w-5xl space-y-5">
      {/* Profile Header Card */}
      <Card className="relative overflow-hidden p-0">
        <div className="relative h-32 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 sm:h-44">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
          <Link href="/friends" className="absolute left-3 top-3 sm:left-4 sm:top-4">
            <Button variant="secondary" size="sm" className="gap-1.5 bg-slate-900/60 text-xs backdrop-blur-md">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Communauté</span>
            </Button>
          </Link>
        </div>

        <div className="relative px-4 pb-5 sm:px-6">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar
                src={profile.avatar}
                fallback={profile.username}
                size="xl"
                className="h-24 w-24 text-3xl ring-4 ring-slate-950 sm:h-28 sm:w-28"
              />
              <div className="min-w-0 pb-1">
                <h1 className="truncate text-xl font-black tracking-tight text-white sm:text-3xl">{profile.displayName}</h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-mono text-indigo-400">@{profile.username}</span>
                  <span className={cn("flex items-center gap-1.5 text-xs", online ? "text-emerald-400" : "text-slate-500")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-emerald-400" : "bg-slate-500")} />
                    {lastSeenLabel(online, lastSeen[targetUsername])}
                  </span>
                  {profile.followsYou && !isMe && (
                    <Badge variant="secondary" className="text-[10px]">
                      {isMutual ? "Ami mutuel" : "Vous suit"}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {!isMe ? (
                <>
                  <Button
                    variant={profile.isFollowing ? "outline" : "default"}
                    className={cn("flex-1 gap-2 sm:flex-initial", profile.isFollowing && "hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400")}
                    onClick={handleToggleFollow}
                    isLoading={followLoading}
                  >
                    {profile.isFollowing ? <UserCheck className="h-4 w-4 text-emerald-400" /> : <UserPlus className="h-4 w-4" />}
                    {profile.isFollowing ? "Abonné" : profile.followsYou ? "Suivre en retour" : "Suivre"}
                  </Button>
                  <Link href={`/messages?with=${profile.username}`} className="flex-1 sm:flex-initial">
                    <Button variant="secondary" className="w-full gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Message
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Button variant="secondary" className="flex-1 gap-2 sm:flex-initial" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    Modifier le profil
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setPasswordOpen(true)} aria-label="Changer le mot de passe">
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => confirm("Se déconnecter de KivaSocial ?") && logout()}
                    aria-label="Se déconnecter"
                    className="hover:border-rose-500/50 hover:text-rose-400"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
            {profile.bio || "Aucune biographie renseignée pour le moment."}
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar className="h-3.5 w-3.5" />
            Membre depuis le {formatDate(profile.createdAt)}
          </p>

          <div className="mt-4 grid max-w-md grid-cols-3 gap-2 text-center">
            {[
              { label: "Publications", value: posts.length, tab: "posts" as Tab },
              { label: "Abonnés", value: profile.followersCount, tab: "followers" as Tab },
              { label: "Abonnements", value: profile.followingCount, tab: "following" as Tab },
            ].map((s) => (
              <button
                key={s.label}
                onClick={() => setActiveTab(s.tab)}
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-2 py-2.5 transition-colors hover:border-slate-700"
              >
                <div className="text-lg font-black text-white sm:text-xl">{s.value}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="scrollbar-none flex overflow-x-auto border-t border-slate-800/80 bg-slate-900/40 px-2 sm:px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3.5 text-xs font-bold uppercase tracking-wider transition-colors sm:px-4",
                activeTab === t.id ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
              )}
            >
              {t.id === "kivadb" && <Code className="h-3.5 w-3.5 text-indigo-400" />}
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      {activeTab === "posts" &&
        (posts.length === 0 ? (
          <Card className="py-12 text-center">
            <Sparkles className="mx-auto mb-3 h-9 w-9 text-slate-600" />
            <p className="font-semibold text-white">Aucune publication</p>
            <p className="mt-1 text-xs text-slate-400">
              {isMe ? "Partagez votre première actualité depuis le fil." : "Ce membre n'a encore rien publié."}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUsername={currentUser?.username || ""}
                onChange={(updated) => setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
                onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
              />
            ))}
          </div>
        ))}

      {activeTab === "followers" && (
        <Card className="p-4 sm:p-6">
          {renderUserList(profile.followers, "Aucun abonné pour l'instant.")}
        </Card>
      )}

      {activeTab === "following" && (
        <Card className="p-4 sm:p-6">
          {renderUserList(profile.following, "Ce membre ne suit encore personne.")}
        </Card>
      )}

      {activeTab === "kivadb" && (
        <Card className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex min-w-0 items-center gap-2 font-mono text-xs font-bold text-white sm:text-sm">
              <Database className="h-4 w-4 shrink-0 text-indigo-400" />
              <span className="truncate">GET /v1/key/user:{profile.username}</span>
            </h3>
            <Badge variant="default" className="font-mono text-[10px]">
              workspace: social_app
            </Badge>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-400">
            {JSON.stringify(
              {
                username: profile.username,
                displayName: profile.displayName,
                bio: profile.bio,
                avatar: profile.avatar,
                followers: profile.followers,
                following: profile.following,
                createdAt: profile.createdAt,
                passwordHash: "•••••• (jamais exposé par l'API)",
              },
              null,
              2
            )}
          </pre>
        </Card>
      )}

      {isMe && (
        <>
          <EditProfileDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            profile={profile}
            onSaved={(updated) => {
              setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
              setUser(updated);
            }}
          />
          <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
        </>
      )}
    </div>
  );
}

function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: UserProfile;
  onSaved: (p: UserProfile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDisplayName(profile.displayName);
      setBio(profile.bio);
      setAvatar(profile.avatar);
    }
  }, [open, profile]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image (JPG, PNG, WebP…)");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await api.uploadFile(file);
      setAvatar(uploaded.url);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateProfile({ displayName, bio, avatar });
      onSaved(updated);
      toast.success("Profil mis à jour");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Modifier le profil" description="Ces informations sont publiques.">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar src={avatar} fallback={profile.username} size="xl" />
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <Button type="button" variant="secondary" size="sm" className="gap-2" onClick={() => fileRef.current?.click()} isLoading={uploading}>
              <Upload className="h-3.5 w-3.5" />
              Importer une photo
            </Button>
            <button
              type="button"
              className="block text-xs text-slate-400 hover:text-white"
              onClick={() => setAvatar("")}
            >
              Revenir à l&apos;avatar par défaut
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Nom affiché</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} required />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Bio</label>
            <span className="text-[11px] tabular-nums text-slate-500">{bio.length}/280</span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-700/80 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">URL de l&apos;avatar (optionnel)</label>
          <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" isLoading={saving}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrent("");
      setNext("");
      setConfirmNext("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirmNext) {
      toast.error("Les deux nouveaux mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.changePassword(current, next);
      toast.success(
        res.revokedSessions > 0
          ? `Mot de passe modifié — ${res.revokedSessions} autre(s) session(s) déconnectée(s).`
          : "Mot de passe modifié."
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Changer le mot de passe"
      description="Vos autres appareils seront automatiquement déconnectés."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input type="password" placeholder="Mot de passe actuel" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        <Input type="password" placeholder="Nouveau mot de passe (6 caractères min.)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required />
        <Input
          type="password"
          placeholder="Confirmer le nouveau mot de passe"
          value={confirmNext}
          onChange={(e) => setConfirmNext(e.target.value)}
          autoComplete="new-password"
          error={confirmNext && confirmNext !== next ? "Les mots de passe ne correspondent pas" : undefined}
          required
        />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" isLoading={saving}>
            Mettre à jour
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
