export function getBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
}

/**
 * fetch() qui signale une session expirée (401 sur une requête authentifiée)
 * pour que l'AuthContext déconnecte proprement l'utilisateur.
 */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  const headers = (init?.headers || {}) as Record<string, string>;
  if (res.status === 401 && headers["Authorization"] && typeof window !== "undefined") {
    window.dispatchEvent(new Event("kiva:unauthorized"));
  }
  return res;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("kiva_token");
  } catch {
    return null;
  }
}

export function resolveMediaUrl(url?: string): string {
  if (!url) return "";
  return url.startsWith("/uploads/") ? `${getBackendUrl()}${url}` : url;
}

export interface UserSummaryItem {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  followsYou?: boolean;
  createdAt: number;
}

export interface UserProfile extends UserSummaryItem {
  followers: string[];
  following: string[];
  followsYou?: boolean;
}

export interface MessageAttachment {
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
  duration?: number;
}

export interface ChatMessage {
  id: string;
  deleted?: boolean;
  from: string;
  fromDisplayName?: string;
  fromAvatar?: string;
  to: string;
  content: string;
  attachments?: MessageAttachment[];
  mentions?: string[];
  read?: boolean;
  readAt?: number;
  timestamp: number;
}

export interface NotificationItem {
  id: string;
  toUser: string;
  fromUser: string;
  fromDisplayName?: string;
  fromAvatar?: string;
  type: 'mention' | 'message' | 'invite' | 'like' | 'comment' | 'follow' | 'join_request';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: number;
}

export interface ChannelItem {
  id: string;
  name: string;
  description: string;
  creator: string;
  admins: string[];
  isPrivate: boolean;
  members: string[];
  createdAt: number;
}

export type SalonVisibility = 'public' | 'visible_private' | 'hidden_private';

export interface SalonItem {
  id: string;
  communityId: string;
  name: string;
  description: string;
  creator: string;
  visibility: SalonVisibility;
  members: string[];
  joinRequests: string[];
  createdAt: number;
}

export interface CommunityItem {
  id: string;
  name: string;
  description: string;
  creator: string;
  admins: string[];
  members: string[];
  isPrivate: boolean;
  pendingInvites: string[];
  joinRequests: string[];
  createdAt: number;
  salons?: SalonItem[];
}

export interface PostItem {
  id: string;
  author: string;
  displayName: string;
  avatar: string;
  content: string;
  likes: string[];
  likesCount: number;
  commentsCount?: number;
  hashtags?: string[];
  timestamp: number;
  editedAt?: number;
}

export interface CommentItem {
  id: string;
  postId: string;
  author: string;
  displayName: string;
  avatar: string;
  content: string;
  timestamp: number;
}

export interface SuggestionItem extends UserSummaryItem {
  mutualCount: number;
  mutuals: string[];
}

export interface PresenceState {
  online: string[];
  lastSeen: Record<string, number>;
}

export type FeedScope = "all" | "following";

export interface ConversationSummary {
  withUser: string;
  lastMessage: string;
  lastTimestamp: number;
  messageCount: number;
  unreadCount?: number;
}

class ApiService {
  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  private async json<T>(res: Response, fallback: string): Promise<T> {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = Array.isArray(json.message) ? json.message[0] : json.message;
      throw new Error(message || fallback);
    }
    return json as T;
  }

  async me(): Promise<UserProfile> {
    const res = await apiFetch(`${getBackendUrl()}/auth/me`, { headers: this.getHeaders() });
    return this.json(res, "Session invalide");
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; revokedSessions: number }> {
    const res = await apiFetch(`${getBackendUrl()}/auth/password`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return this.json(res, "Erreur lors du changement de mot de passe");
  }

  async updateProfile(data: { displayName?: string; bio?: string; avatar?: string }): Promise<UserProfile> {
    const res = await apiFetch(`${getBackendUrl()}/users/me`, {
      method: "PATCH",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.json(res, "Erreur lors de la mise à jour du profil");
  }

  async getPresence(): Promise<PresenceState> {
    const res = await apiFetch(`${getBackendUrl()}/users/presence`, { headers: this.getHeaders() });
    if (!res.ok) return { online: [], lastSeen: {} };
    return res.json();
  }

  async getSuggestions(): Promise<SuggestionItem[]> {
    const res = await apiFetch(`${getBackendUrl()}/users/suggestions`, { headers: this.getHeaders() });
    if (!res.ok) return [];
    return res.json();
  }

  async getFeed(opts: { scope?: FeedScope; author?: string; tag?: string } = {}): Promise<PostItem[]> {
    const params = new URLSearchParams();
    if (opts.scope) params.set("scope", opts.scope);
    if (opts.author) params.set("author", opts.author);
    if (opts.tag) params.set("tag", opts.tag);
    const res = await apiFetch(`${getBackendUrl()}/posts?${params.toString()}`, { headers: this.getHeaders() });
    if (!res.ok) return [];
    return res.json();
  }

  async getTrending(): Promise<Array<{ tag: string; count: number }>> {
    const res = await apiFetch(`${getBackendUrl()}/posts/trending`, { headers: this.getHeaders() });
    if (!res.ok) return [];
    return res.json();
  }

  async updatePost(id: string, content: string): Promise<PostItem> {
    const res = await apiFetch(`${getBackendUrl()}/posts/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify({ content }),
    });
    return this.json(res, "Erreur lors de la modification");
  }

  async getComments(postId: string): Promise<CommentItem[]> {
    const res = await apiFetch(`${getBackendUrl()}/posts/${encodeURIComponent(postId)}/comments`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async addComment(postId: string, content: string): Promise<CommentItem> {
    const res = await apiFetch(`${getBackendUrl()}/posts/${encodeURIComponent(postId)}/comments`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ content }),
    });
    return this.json(res, "Erreur lors de l'envoi du commentaire");
  }

  async deleteComment(postId: string, commentId: string): Promise<void> {
    const res = await apiFetch(
      `${getBackendUrl()}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE", headers: this.getHeaders() }
    );
    await this.json(res, "Erreur lors de la suppression du commentaire");
  }

  async getMessagesPage(withUser: string, before?: number, limit = 50): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
    const params = new URLSearchParams({ with: withUser, limit: String(limit) });
    if (before) params.set("before", String(before));
    const res = await apiFetch(`${getBackendUrl()}/messages/page?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    return this.json(res, "Erreur de récupération des messages");
  }

  async deleteMessage(id: string): Promise<ChatMessage> {
    const res = await apiFetch(`${getBackendUrl()}/messages/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return this.json(res, "Erreur lors de la suppression du message");
  }

  async register(data: { username: string; password: string; displayName?: string; bio?: string }) {
    const res = await apiFetch(`${getBackendUrl()}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || "Erreur lors de l'inscription");
    }
    return json;
  }

  async login(data: { username: string; password: string }) {
    const res = await apiFetch(`${getBackendUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || 'Identifiant ou mot de passe incorrect');
    }
    return json;
  }

  async logoutSession(): Promise<void> {
    try {
      await apiFetch(`${getBackendUrl()}/auth/logout`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
    } catch {}
  }

  async getUsers(): Promise<UserSummaryItem[]> {
    const res = await apiFetch(`${getBackendUrl()}/users`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Erreur lors de la récupération des utilisateurs");
    return res.json();
  }

  async getProfile(username: string): Promise<UserProfile> {
    const res = await apiFetch(`${getBackendUrl()}/users/${encodeURIComponent(username)}/profile`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Utilisateur introuvable");
    return json;
  }

  async toggleFollow(username: string): Promise<{ following: boolean; followersCount: number; followingCount: number }> {
    const res = await apiFetch(`${getBackendUrl()}/users/${encodeURIComponent(username)}/follow`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors de l'abonnement");
    return json;
  }

  async sendMessage(data: { to?: string; content?: string; attachments?: MessageAttachment[] }): Promise<ChatMessage> {
    const res = await apiFetch(`${getBackendUrl()}/messages`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur d'envoi du message");
    return json;
  }

  async getMessages(withUser?: string): Promise<ChatMessage[]> {
    const url = withUser
      ? `${getBackendUrl()}/messages?with=${encodeURIComponent(withUser)}`
      : `${getBackendUrl()}/messages`;
    const res = await apiFetch(url, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Erreur de récupération des messages");
    return res.json();
  }

  async getConversations(): Promise<ConversationSummary[]> {
    const res = await apiFetch(`${getBackendUrl()}/messages/conversations`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async getPosts(): Promise<PostItem[]> {
    const res = await apiFetch(`${getBackendUrl()}/posts`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async createPost(content: string): Promise<PostItem> {
    const res = await apiFetch(`${getBackendUrl()}/posts`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ content }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors de la publication");
    return json;
  }

  async toggleLikePost(id: string): Promise<PostItem> {
    const res = await apiFetch(`${getBackendUrl()}/posts/${encodeURIComponent(id)}/like`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors du like");
    return json;
  }

  async deletePost(id: string): Promise<boolean> {
    const res = await apiFetch(`${getBackendUrl()}/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  async getChannels(): Promise<ChannelItem[]> {
    const res = await apiFetch(`${getBackendUrl()}/channels`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async createChannel(data: { name: string; description?: string; isPrivate?: boolean }): Promise<ChannelItem> {
    const res = await apiFetch(`${getBackendUrl()}/channels`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de création du salon");
    return json;
  }

  async updateChannel(id: string, data: { name?: string; description?: string; isPrivate?: boolean; members?: string[] }): Promise<ChannelItem> {
    const res = await apiFetch(`${getBackendUrl()}/channels/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de modification du salon");
    return json;
  }

  async deleteChannel(id: string): Promise<boolean> {
    const res = await apiFetch(`${getBackendUrl()}/channels/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de suppression du salon");
    return true;
  }

  // ==========================================
  // COMMUNITIES & SALONS
  // ==========================================

  async getCommunities(): Promise<CommunityItem[]> {
    const res = await apiFetch(`${getBackendUrl()}/communities`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async createCommunity(data: { name: string; description?: string; isPrivate?: boolean }): Promise<CommunityItem> {
    const res = await apiFetch(`${getBackendUrl()}/communities`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de création de la communauté");
    return json;
  }

  async updateCommunity(id: string, data: { name?: string; description?: string; isPrivate?: boolean }): Promise<CommunityItem> {
    const res = await apiFetch(`${getBackendUrl()}/communities/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de mise à jour");
    return json;
  }

  async deleteCommunity(id: string): Promise<boolean> {
    const res = await apiFetch(`${getBackendUrl()}/communities/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  async inviteToCommunity(communityId: string, username: string): Promise<CommunityItem> {
    const res = await apiFetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/invite`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ username }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur d'invitation");
    return json;
  }

  async respondToCommunityInvite(communityId: string, accept: boolean): Promise<CommunityItem> {
    const res = await apiFetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/respond-invite`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ accept }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de réponse à l'invitation");
    return json;
  }

  async joinCommunity(communityId: string): Promise<CommunityItem> {
    const res = await apiFetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/join`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur pour rejoindre la communauté");
    return json;
  }

  async toggleCommunityAdmin(communityId: string, username: string): Promise<CommunityItem> {
    const res = await apiFetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/admins`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ username }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de modification des administrateurs");
    return json;
  }

  async getSalons(communityId: string): Promise<SalonItem[]> {
    const res = await apiFetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async createSalon(
    communityId: string,
    data: { name: string; description?: string; visibility?: SalonVisibility }
  ): Promise<SalonItem> {
    const res = await apiFetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de création du salon");
    return json;
  }

  async updateSalon(
    communityId: string,
    salonId: string,
    data: { name?: string; description?: string; visibility?: SalonVisibility }
  ): Promise<SalonItem> {
    const res = await apiFetch(
      `${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons/${encodeURIComponent(salonId)}`,
      {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de mise à jour du salon");
    return json;
  }

  async deleteSalon(communityId: string, salonId: string): Promise<boolean> {
    const res = await apiFetch(
      `${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons/${encodeURIComponent(salonId)}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      }
    );
    return res.ok;
  }

  async addMemberToSalon(communityId: string, salonId: string, username: string): Promise<SalonItem> {
    const res = await apiFetch(
      `${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons/${encodeURIComponent(salonId)}/members`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ username }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors de l'ajout au salon");
    return json;
  }

  async requestJoinSalon(communityId: string, salonId: string): Promise<SalonItem> {
    const res = await apiFetch(
      `${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons/${encodeURIComponent(salonId)}/join-request`,
      {
        method: "POST",
        headers: this.getHeaders(),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors de la demande d'accès");
    return json;
  }

  async respondSalonJoinRequest(
    communityId: string,
    salonId: string,
    username: string,
    approve: boolean
  ): Promise<SalonItem> {
    const res = await apiFetch(
      `${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons/${encodeURIComponent(salonId)}/respond-join`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ username, approve }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de traitement de la demande");
    return json;
  }

  // ==========================================
  // MEDIA UPLOADS
  // ==========================================

  async uploadFile(file: File | Blob, customName?: string): Promise<MessageAttachment> {
    const formData = new FormData();
    const filename = customName || (file instanceof File ? file.name : `voice_${Date.now()}.webm`);
    formData.append("file", file, filename);

    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await apiFetch(`${getBackendUrl()}/uploads`, {
      method: "POST",
      headers,
      body: formData,
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors de l'upload du fichier");
    return json;
  }

  // ==========================================
  // NOTIFICATIONS & UNREAD COUNTS
  // ==========================================

  async getNotifications(): Promise<NotificationItem[]> {
    const res = await apiFetch(`${getBackendUrl()}/notifications`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async getUnreadNotificationsCount(): Promise<number> {
    const res = await apiFetch(`${getBackendUrl()}/notifications/unread-count`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return json.count || 0;
  }

  async markNotificationAsRead(id: string): Promise<boolean> {
    const res = await apiFetch(`${getBackendUrl()}/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  async markAllNotificationsAsRead(): Promise<boolean> {
    const res = await apiFetch(`${getBackendUrl()}/notifications/read-all`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  async getUnreadMessagesCount(): Promise<number> {
    const res = await apiFetch(`${getBackendUrl()}/messages/unread-count`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return json.count || 0;
  }

  async markMessagesAsRead(withUser: string): Promise<boolean> {
    const res = await apiFetch(`${getBackendUrl()}/messages/read`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ withUser }),
    });
    return res.ok;
  }
}

export const api = new ApiService();
