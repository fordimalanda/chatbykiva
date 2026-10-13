"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { api, UserProfile } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { KivaEventTicker } from "@/components/KivaEventTicker";
import { formatDate } from "@/lib/utils";
import {
  Users,
  UserCheck,
  UserPlus,
  MessageSquare,
  Database,
  Calendar,
  Code,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const targetUsername = resolvedParams.username.toLowerCase();

  const { user: currentUser, refreshUser } = useAuth();
  const { socket } = useSocket();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"about" | "followers" | "following" | "kivadb">("about");

  const fetchProfile = async () => {
    try {
      const data = await api.getProfile(targetUsername);
      setProfile(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [targetUsername, currentUser]);

  // Real-time synchronization: when followers/following change in KivaDB, update live counters!
  useEffect(() => {
    if (!socket) return;

    const handleUserUpdated = (updated: any) => {
      if (updated.username === targetUsername) {
        setProfile((prev) => {
          if (!prev) return null;
          const isNowFollowing = currentUser
            ? (updated.followers || []).includes(currentUser.username)
            : prev.isFollowing;
          return {
            ...prev,
            displayName: updated.displayName || prev.displayName,
            avatar: updated.avatar || prev.avatar,
            bio: updated.bio || prev.bio,
            followers: updated.followers || [],
            following: updated.following || [],
            followersCount: updated.followersCount,
            followingCount: updated.followingCount,
            isFollowing: isNowFollowing,
          };
        });
      }

      if (currentUser && updated.username === currentUser.username) {
        refreshUser();
      }
    };

    socket.on("user:updated", handleUserUpdated);

    return () => {
      socket.off("user:updated", handleUserUpdated);
    };
  }, [socket, targetUsername, currentUser, refreshUser]);

  const handleToggleFollow = async () => {
    if (!currentUser) {
      alert("Veuillez vous connecter pour vous abonner.");
      return;
    }

    setFollowLoading(true);

    // Optimistic UI update
    setProfile((prev) => {
      if (!prev) return null;
      const nextFollowing = !prev.isFollowing;
      return {
        ...prev,
        isFollowing: nextFollowing,
        followersCount: nextFollowing ? prev.followersCount + 1 : Math.max(0, prev.followersCount - 1),
      };
    });

    try {
      const res = await api.toggleFollow(targetUsername);
      setProfile((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          isFollowing: res.following,
          followersCount: res.followersCount,
          followingCount: res.followingCount,
        };
      });
      await refreshUser();
    } catch (err: any) {
      alert(err.message || "Erreur lors de la modification du suivi");
      fetchProfile();
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-2xl font-bold text-white">Utilisateur introuvable</h2>
        <p className="text-slate-400">
          La clé <code className="text-indigo-400 font-mono">user:{targetUsername}</code> n&apos;existe pas dans le workspace social_app de KivaDB.
        </p>
        <Link href="/friends">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour aux utilisateurs
          </Button>
        </Link>
      </div>
    );
  }

  const isMe = currentUser?.username === targetUsername;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <KivaEventTicker />

      {/* Profile Header Card */}
      <Card className="border-slate-800/90 overflow-hidden relative shadow-2xl">
        {/* Banner */}
        <div className="h-36 sm:h-48 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 relative">
          <div className="absolute top-4 left-4">
            <Link href="/friends">
              <Button variant="secondary" size="sm" className="gap-1.5 bg-slate-900/60 backdrop-blur-md text-xs">
                <ArrowLeft className="h-3.5 w-3.5" />
                Communauté
              </Button>
            </Link>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <Badge variant="secondary" className="bg-slate-900/70 backdrop-blur-md text-indigo-300 font-mono">
              user:{profile.username}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-16 sm:-mt-20 mb-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-left">
              <Avatar
                src={profile.avatar}
                fallback={profile.username}
                size="xl"
                className="h-28 w-28 text-3xl ring-4 ring-slate-950 shadow-2xl"
              />
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {profile.displayName}
                </h1>
                <p className="text-sm font-mono text-indigo-400">@{profile.username}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              {!isMe ? (
                <>
                  <Button
                    variant={profile.isFollowing ? "outline" : "default"}
                    className={`gap-2 ${
                      profile.isFollowing
                        ? "hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400"
                        : "shadow-lg shadow-indigo-500/20"
                    }`}
                    onClick={handleToggleFollow}
                    isLoading={followLoading}
                  >
                    {profile.isFollowing ? (
                      <>
                        <UserCheck className="h-4 w-4 text-emerald-400" />
                        Abonné (Unfollow)
                      </>
                    ) : profile.followsYou ? (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Suivre en retour
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Suivre (Follow)
                      </>
                    )}
                  </Button>

                  <Link href={`/messages?with=${profile.username}`}>
                    <Button variant="secondary" className="gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Envoyer un message
                    </Button>
                  </Link>
                </>
              ) : (
                <Badge variant="default" className="text-xs px-3 py-1">
                  C&apos;est votre profil
                </Badge>
              )}
            </div>
          </div>

          {/* Bio */}
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed mb-6">
            {profile.bio || "Aucune biographie renseignée pour le moment."}
          </p>

          {/* Live Counters */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center max-w-xl">
            <button
              onClick={() => setActiveTab("followers")}
              className="hover:opacity-80 transition-opacity"
            >
              <div className="text-2xl font-black text-white">{profile.followersCount}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Abonnés (Followers)
              </div>
            </button>
            <button
              onClick={() => setActiveTab("following")}
              className="hover:opacity-80 transition-opacity"
            >
              <div className="text-2xl font-black text-white">{profile.followingCount}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Abonnements
              </div>
            </button>
            <div>
              <div className="text-2xl font-black text-indigo-400 flex items-center justify-center gap-1">
                <Database className="h-5 w-5" />
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                KivaDB Doc
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation (Responsive scrollable) */}
        <div className="flex border-t border-slate-800/80 px-4 sm:px-6 bg-slate-900/40 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("about")}
            className={`py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "about"
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            À propos
          </button>
          <button
            onClick={() => setActiveTab("followers")}
            className={`py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "followers"
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Abonnés ({profile.followersCount})
          </button>
          <button
            onClick={() => setActiveTab("following")}
            className={`py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "following"
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Abonnements ({profile.followingCount})
          </button>
          <button
            onClick={() => setActiveTab("kivadb")}
            className={`py-3.5 px-3 sm:px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "kivadb"
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code className="h-3.5 w-3.5 text-indigo-400" />
            Document KivaDB JSON
          </button>
        </div>
      </Card>

      {/* Tab Contents */}
      {activeTab === "about" && (
        <Card className="border-slate-800/90 p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-400" />
            Informations du compte
          </h3>
          <div className="space-y-3 text-sm text-slate-300">
            <p>
              <strong className="text-slate-400">Date d&apos;inscription :</strong>{" "}
              {formatDate(profile.createdAt)}
            </p>
            <p>
              <strong className="text-slate-400">Stockage :</strong> Document JSON KivaDB NoSQL
              associé à la clé unique{" "}
              <code className="text-indigo-400 font-mono">user:{profile.username}</code>
            </p>
            <p>
              <strong className="text-slate-400">Synchronisation :</strong> Abonnements en temps réel
              via le protocole d&apos;événement KivaDB.
            </p>
          </div>
        </Card>
      )}

      {activeTab === "followers" && (
        <Card className="border-slate-800/90 p-6">
          <h3 className="text-base font-bold text-white mb-4">
            Personnes qui suivent @{profile.username} ({profile.followers.length})
          </h3>
          {profile.followers.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              Aucun abonné pour l&apos;instant. Cliquez sur &ldquo;Suivre&rdquo; pour être le premier !
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profile.followers.map((fUsername) => (
                <Link
                  key={fUsername}
                  href={`/profile/${fUsername}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:bg-slate-800/50 transition-colors"
                >
                  <Avatar
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${fUsername}`}
                    fallback={fUsername}
                    size="sm"
                  />
                  <span className="font-semibold text-sm text-white hover:text-indigo-300">
                    @{fUsername}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === "following" && (
        <Card className="border-slate-800/90 p-6">
          <h3 className="text-base font-bold text-white mb-4">
            Abonnements de @{profile.username} ({profile.following.length})
          </h3>
          {profile.following.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              Cet utilisateur ne suit encore personne.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profile.following.map((fUsername) => (
                <Link
                  key={fUsername}
                  href={`/profile/${fUsername}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:bg-slate-800/50 transition-colors"
                >
                  <Avatar
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${fUsername}`}
                    fallback={fUsername}
                    size="sm"
                  />
                  <span className="font-semibold text-sm text-white hover:text-indigo-300">
                    @{fUsername}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === "kivadb" && (
        <Card className="border-slate-800/90 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-400" />
              GET /v1/key/user:{profile.username}?workspace=social_app
            </h3>
            <Badge variant="default" className="font-mono text-[10px]">
              type: object
            </Badge>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 text-xs font-mono overflow-x-auto leading-relaxed">
            {JSON.stringify(
              {
                username: profile.username,
                displayName: profile.displayName,
                bio: profile.bio,
                avatar: profile.avatar,
                followers: profile.followers,
                following: profile.following,
                createdAt: profile.createdAt,
              },
              null,
              2
            )}
          </pre>
        </Card>
      )}
    </div>
  );
}
