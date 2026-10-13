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
  createdAt: number;
}

export interface UserProfile extends UserSummaryItem {
  followers: string[];
  following: string[];
}

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  content: string;
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
}

export const api = new ApiService();
