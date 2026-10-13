export function getBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
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

export interface ChatMessage {
  id: string;
  from: string;
  fromDisplayName?: string;
  fromAvatar?: string;
  to: string;
  content: string;
  mentions?: string[];
  timestamp: number;
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
  timestamp: number;
}

export interface ConversationSummary {
  withUser: string;
  lastMessage: string;
  lastTimestamp: number;
  messageCount: number;
}

class ApiService {
  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("kiva_token");
      const user = localStorage.getItem("kiva_user");
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (user) {
        try {
          const parsed = JSON.parse(user);
          if (parsed?.username) headers["x-user"] = parsed.username;
        } catch {}
      }
    }
    return headers;
  }

  async register(data: { username: string; password: string; displayName?: string; bio?: string }) {
    const res = await fetch(`${getBackendUrl()}/auth/register`, {
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
    const res = await fetch(`${getBackendUrl()}/auth/login`, {
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
    // Appelle POST /auth/logout pour supprimer la session de KivaDB
    try {
      await fetch(`${getBackendUrl()}/auth/logout`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
    } catch {
      // Silencieux : la déconnexion locale se fait de toute façon
    }
  }

  async getUsers(): Promise<UserSummaryItem[]> {
    const res = await fetch(`${getBackendUrl()}/users`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Erreur lors de la récupération des utilisateurs");
    return res.json();
  }

  async getProfile(username: string): Promise<UserProfile> {
    const res = await fetch(`${getBackendUrl()}/users/${encodeURIComponent(username)}/profile`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Utilisateur introuvable");
    return json;
  }

  async toggleFollow(username: string): Promise<{ following: boolean; followersCount: number; followingCount: number }> {
    const res = await fetch(`${getBackendUrl()}/users/${encodeURIComponent(username)}/follow`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors de l'abonnement");
    return json;
  }

  async sendMessage(data: { to?: string; content: string }): Promise<ChatMessage> {
    const res = await fetch(`${getBackendUrl()}/messages`, {
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
    const res = await fetch(url, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Erreur de récupération des messages");
    return res.json();
  }

  async getConversations(): Promise<ConversationSummary[]> {
    const res = await fetch(`${getBackendUrl()}/messages/conversations`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async getPosts(): Promise<PostItem[]> {
    const res = await fetch(`${getBackendUrl()}/posts`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async createPost(content: string): Promise<PostItem> {
    const res = await fetch(`${getBackendUrl()}/posts`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ content }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors de la publication");
    return json;
  }

  async toggleLikePost(id: string): Promise<PostItem> {
    const res = await fetch(`${getBackendUrl()}/posts/${encodeURIComponent(id)}/like`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur lors du like");
    return json;
  }

  async deletePost(id: string): Promise<boolean> {
    const res = await fetch(`${getBackendUrl()}/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  async getChannels(): Promise<ChannelItem[]> {
    const res = await fetch(`${getBackendUrl()}/channels`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async createChannel(data: { name: string; description?: string; isPrivate?: boolean }): Promise<ChannelItem> {
    const res = await fetch(`${getBackendUrl()}/channels`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de création du salon");
    return json;
  }

  async updateChannel(id: string, data: { name?: string; description?: string; isPrivate?: boolean; members?: string[] }): Promise<ChannelItem> {
    const res = await fetch(`${getBackendUrl()}/channels/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de modification du salon");
    return json;
  }

  async deleteChannel(id: string): Promise<boolean> {
    const res = await fetch(`${getBackendUrl()}/channels/${encodeURIComponent(id)}`, {
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
    const res = await fetch(`${getBackendUrl()}/communities`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async createCommunity(data: { name: string; description?: string; isPrivate?: boolean }): Promise<CommunityItem> {
    const res = await fetch(`${getBackendUrl()}/communities`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de création de la communauté");
    return json;
  }

  async updateCommunity(id: string, data: { name?: string; description?: string; isPrivate?: boolean }): Promise<CommunityItem> {
    const res = await fetch(`${getBackendUrl()}/communities/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de mise à jour");
    return json;
  }

  async deleteCommunity(id: string): Promise<boolean> {
    const res = await fetch(`${getBackendUrl()}/communities/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return res.ok;
  }

  async inviteToCommunity(communityId: string, username: string): Promise<CommunityItem> {
    const res = await fetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/invite`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ username }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur d'invitation");
    return json;
  }

  async respondToCommunityInvite(communityId: string, accept: boolean): Promise<CommunityItem> {
    const res = await fetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/respond-invite`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ accept }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de réponse à l'invitation");
    return json;
  }

  async joinCommunity(communityId: string): Promise<CommunityItem> {
    const res = await fetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/join`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur pour rejoindre la communauté");
    return json;
  }

  async toggleCommunityAdmin(communityId: string, username: string): Promise<CommunityItem> {
    const res = await fetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/admins`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ username }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Erreur de modification des administrateurs");
    return json;
  }

  async getSalons(communityId: string): Promise<SalonItem[]> {
    const res = await fetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }

  async createSalon(
    communityId: string,
    data: { name: string; description?: string; visibility?: SalonVisibility }
  ): Promise<SalonItem> {
    const res = await fetch(`${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons`, {
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
    const res = await fetch(
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
    const res = await fetch(
      `${getBackendUrl()}/communities/${encodeURIComponent(communityId)}/salons/${encodeURIComponent(salonId)}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      }
    );
    return res.ok;
  }

  async addMemberToSalon(communityId: string, salonId: string, username: string): Promise<SalonItem> {
    const res = await fetch(
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
    const res = await fetch(
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
    const res = await fetch(
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
}

export const api = new ApiService();
