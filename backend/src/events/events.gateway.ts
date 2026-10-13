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
import { UserDocument } from '../auth/auth.service';
import { ChatMessage, MessagesService } from '../messages/messages.service';

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

  constructor(
    private readonly kivaService: KivaService,
    private readonly messagesService: MessagesService,
  ) {}

  onModuleInit() {
    // Bridge real-time events coming directly from KivaDB WebSocket
    this.kivaService.addEventListener(async (event: KivaEvent) => {
      this.handleKivaEvent(event);
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Frontend client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Frontend client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_user')
  handleJoinUser(@ConnectedSocket() client: Socket, @MessageBody() username: string) {
    if (username) {
      const room = `user:${username.toLowerCase()}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined personal room ${room}`);
      return { status: 'joined', room };
    }
  }

  @SubscribeMessage('send_message')
  async handleSocketSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { from: string; to: string; content: string },
  ) {
    if (!payload?.from || !payload?.content) {
      return { error: 'Invalid payload' };
    }
    const msg = await this.messagesService.createMessage(payload.from, payload.to || 'all', payload.content);
    this.broadcastMessage(msg);
    return { status: 'ok', msg };
  }

  public broadcastMessage(msg: ChatMessage) {
    this.logger.log(`Broadcasting message [${msg.id}] from ${msg.from} to ${msg.to}`);
    // Broadcast to global channel
    this.server?.emit('message:new', msg);
    // Direct rooms
    if (msg.to && msg.to !== 'all') {
      this.server?.to(`user:${msg.to.toLowerCase()}`).emit('message:direct', msg);
    }
    if (msg.from) {
      this.server?.to(`user:${msg.from.toLowerCase()}`).emit('message:direct', msg);
    }
  }

  public broadcastPost(post: any) {
    this.logger.log(`Broadcasting post [${post.id}] by ${post.author}`);
    this.server?.emit('post:new', post);
  }

  public broadcastPostUpdated(post: any) {
    this.logger.log(`Broadcasting updated post [${post.id}]`);
    this.server?.emit('post:updated', post);
  }

  public broadcastPostDeleted(postId: string) {
    this.logger.log(`Broadcasting deleted post [${postId}]`);
    this.server?.emit('post:deleted', { id: postId });
  }

  /**
   * Process and relay KivaDB change notification to Frontend
   */
  private async handleKivaEvent(event: KivaEvent) {
    this.logger.log(`[KivaDB Stream -> Socket.IO Bridge] Event: ${event.event} on key: ${event.key}`);

    // Always broadcast the raw Kiva event
    this.server?.emit('kiva:event', event);

    if (!event.key) return;

    // 1. If a message was stored or updated in KivaDB
    if (event.key.startsWith('msg:') && (event.event === 'set' || event.event === 'update')) {
      const msg = await this.kivaService.get<ChatMessage>(event.key);
      if (msg) {
        this.broadcastMessage(msg);
      }
    }

    // 2. If a post was created or updated in KivaDB
    if (event.key.startsWith('post:') && (event.event === 'set' || event.event === 'update')) {
      const post = await this.kivaService.get<any>(event.key);
      if (post) {
        this.broadcastPostUpdated(post);
      }
    } else if (event.key.startsWith('post:') && event.event === 'del') {
      const postId = event.key.replace('post:', '');
      this.broadcastPostDeleted(postId);
    }

    // 3. If a user was created or updated (e.g. follow/unfollow) in KivaDB
    if (event.key.startsWith('user:') && (event.event === 'set' || event.event === 'update')) {
      const userDoc = await this.kivaService.get<UserDocument>(event.key);
      if (userDoc) {
        const updatePayload = {
          username: userDoc.username,
          displayName: userDoc.displayName,
          avatar: userDoc.avatar,
          bio: userDoc.bio,
          followers: userDoc.followers || [],
          following: userDoc.following || [],
          followersCount: (userDoc.followers || []).length,
          followingCount: (userDoc.following || []).length,
          timestamp: Date.now(),
        };

        this.logger.log(`Broadcasting user update from KivaDB: ${userDoc.username}`);
        this.server?.emit('user:updated', updatePayload);
      }
    }
  }
}
