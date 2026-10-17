import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KivaService, KivaEvent } from '../kiva/kiva.service';
import { AuthService, UserDocument } from '../auth/auth.service';
import type { ChatMessage } from '../messages/messages.service';
import { isSalonTarget } from '../messages/conversation-keys';

export interface PresenceDocument {
  username: string;
  lastSeen: number;
}

/** Préfixes de clés KivaDB jamais relayés en clair au navigateur (secrets) */
const SENSITIVE_PREFIXES = ['session:'];

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  /** username -> ids des sockets connectés (multi-onglets / multi-appareils) */
  private readonly onlineSockets = new Map<string, Set<string>>();
  /** username -> dernier passage (ms) pour les utilisateurs hors-ligne */
  private readonly lastSeen = new Map<string, number>();

  constructor(
    private readonly kivaService: KivaService,
    private readonly authService: AuthService,
  ) {}

  async onModuleInit() {
    // Bridge real-time events coming directly from KivaDB WebSocket
    this.kivaService.addEventListener(async (event: KivaEvent) => {
      this.handleKivaEvent(event);
    });

    // Restaurer les "vu pour la dernière fois" depuis KivaDB
    const items = await this.kivaService.range<PresenceDocument>('presence:', 'presence:~', 10000);
    for (const item of items) {
      if (item.data?.username) this.lastSeen.set(item.data.username, item.data.lastSeen);
    }
  }

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string) || null;
    const username = token ? await this.authService.validateSession(token) : null;
    if (!username) {
      // Socket anonyme : reçoit uniquement les événements publics
      this.logger.log(`Anonymous client connected: ${client.id}`);
      return;
    }
    this.attachUser(client, username);
  }

  handleDisconnect(client: Socket) {
    const username: string | undefined = client.data?.username;
    if (!username) return;
    const sockets = this.onlineSockets.get(username);
    if (!sockets) return;
    sockets.delete(client.id);
    if (sockets.size === 0) {
      this.onlineSockets.delete(username);
      const now = Date.now();
      this.lastSeen.set(username, now);
      this.kivaService.set(`presence:${username}`, { username, lastSeen: now }).catch(() => undefined);
      this.server?.emit('presence:update', { username, online: false, lastSeen: now });
    }
  }

  private attachUser(client: Socket, username: string) {
    client.data.username = username;
    client.join(`user:${username}`);
    const sockets = this.onlineSockets.get(username) || new Set<string>();
    const wasOffline = sockets.size === 0;
    sockets.add(client.id);
    this.onlineSockets.set(username, sockets);
    if (wasOffline) {
      this.server?.emit('presence:update', { username, online: true });
    }
    this.logger.log(`Client ${client.id} authenticated as ${username}`);
  }

  /**
   * Compatibilité : les anciens clients envoyaient leur username en clair.
   * On ne fait plus confiance au payload — seule l'identité du handshake compte.
   */
  @SubscribeMessage('join_user')
  handleJoinUser(@ConnectedSocket() client: Socket) {
    const username: string | undefined = client.data?.username;
    if (!username) return { error: 'unauthenticated' };
    return { status: 'joined', room: `user:${username}` };
  }

  /**
   * Indicateur "en train d'écrire…" : relayé au destinataire (DM) ou au salon.
   */
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { to?: string; isTyping?: boolean },
  ) {
    const from: string | undefined = client.data?.username;
    const to = payload?.to?.trim().toLowerCase();
    if (!from || !to) return;
    const event = { from, to, isTyping: !!payload.isTyping };
    if (isSalonTarget(to)) {
      client.broadcast.emit('typing', event);
    } else if (to !== from) {
      this.server?.to(`user:${to}`).emit('typing', event);
    }
  }

  // ==========================================
  // PRESENCE
  // ==========================================

  isOnline(username: string): boolean {
    return this.onlineSockets.has(username.toLowerCase());
  }

  getPresence(): { online: string[]; lastSeen: Record<string, number> } {
    return {
      online: Array.from(this.onlineSockets.keys()),
      lastSeen: Object.fromEntries(this.lastSeen),
    };
  }

  // ==========================================
  // BROADCASTS
  // ==========================================

  /**
   * Diffuse un message à sa seule audience :
   * - DM → les deux participants uniquement
   * - salon public → tout le monde
   * - salon privé → ses membres uniquement
   */
  public broadcastMessage(msg: ChatMessage, salonMembers?: string[] | null, event = 'message:new') {
    const to = (msg.to || '').toLowerCase();
    if (isSalonTarget(to)) {
      if (salonMembers && salonMembers.length > 0) {
        for (const member of salonMembers) {
          this.server?.to(`user:${member.toLowerCase()}`).emit(event, msg);
        }
      } else {
        this.server?.emit(event, msg);
      }
    } else {
      this.server?.to(`user:${to}`).to(`user:${msg.from.toLowerCase()}`).emit(event, msg);
      if (event === 'message:new') {
        this.server?.to(`user:${to}`).emit('message:direct', msg);
      }
    }

    if (event === 'message:new' && Array.isArray(msg.mentions)) {
      for (const mUser of msg.mentions) {
        this.server?.to(`user:${mUser.toLowerCase()}`).emit('message:mention', msg);
      }
    }
  }

  public emitToUser(username: string, event: string, payload: any) {
    this.server?.to(`user:${username.toLowerCase()}`).emit(event, payload);
  }

  public broadcastPost(post: any) {
    this.server?.emit('post:new', post);
  }

  public broadcastPostUpdated(post: any) {
    this.server?.emit('post:updated', post);
  }

  public broadcastPostDeleted(postId: string) {
    this.server?.emit('post:deleted', { id: postId });
  }

  /**
   * Process and relay KivaDB change notification to Frontend
   */
  private async handleKivaEvent(event: KivaEvent) {
    const key = event.key || '';

    // Raw KivaDB event for the live inspector — secrets are masked
    const sensitive = SENSITIVE_PREFIXES.find((p) => key.startsWith(p));
    this.server?.emit('kiva:event', sensitive ? { ...event, key: `${sensitive}••••••` } : event);

    if (!key) return;

    // Posts: re-sync from the database stream
    if (key.startsWith('post:') && (event.event === 'set' || event.event === 'update')) {
      const post = await this.kivaService.get<any>(key);
      if (post) this.broadcastPostUpdated(post);
    } else if (key.startsWith('post:') && event.event === 'del') {
      this.broadcastPostDeleted(key.replace('post:', ''));
    }

    // Users (follow/unfollow, profile edits): public projection only, never the password hash
    if (key.startsWith('user:') && (event.event === 'set' || event.event === 'update')) {
      const userDoc = await this.kivaService.get<UserDocument>(key);
      if (userDoc) {
        this.server?.emit('user:updated', {
          username: userDoc.username,
          displayName: userDoc.displayName,
          avatar: userDoc.avatar,
          bio: userDoc.bio,
          followers: userDoc.followers || [],
          following: userDoc.following || [],
          followersCount: (userDoc.followers || []).length,
          followingCount: (userDoc.following || []).length,
          timestamp: Date.now(),
        });
      }
    }
  }
}
