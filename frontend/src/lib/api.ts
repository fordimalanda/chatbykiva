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
      throw new Error(json.message || "Identifiant ou mot de passe incorrect");
    }
    return json;
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
}

export const api = new ApiService();
