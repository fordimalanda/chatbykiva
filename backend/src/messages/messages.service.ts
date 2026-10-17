import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { UserDocument } from '../auth/auth.service';
import { EventsGateway } from '../events/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import type { SalonDocument, CommunityDocument } from '../communities/communities.service';
import {
  isSalonTarget,
  normalizeSalonTarget,
  conversationKey,
  LEGACY_RANGE,
} from './conversation-keys';

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
  from: string;
  fromDisplayName?: string;
  fromAvatar?: string;
  to: string;
  content: string;
  attachments?: MessageAttachment[];
  mentions?: string[];
  read?: boolean;
  readAt?: number;
  deleted?: boolean;
  timestamp: number;
}

export interface ConversationSummary {
  withUser: string;
  lastMessage: string;
  lastTimestamp: number;
  messageCount: number;
  unreadCount?: number;
}

export interface MessagePage {
  messages: ChatMessage[];
  hasMore: boolean;
}

/** null = salon public (audience : tout le monde) ; tableau = membres autorisés */
type SalonAudience = { members: string[] | null };

const MAX_CONTENT = 4000;
const MAX_ATTACHMENTS = 10;
const RANGE_LIMIT = 50000;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly kivaService: KivaService,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==========================================
  // ACCESS CONTROL
  // ==========================================

  /**
   * Vérifie qu'un utilisateur peut lire/écrire dans un salon.
   * Les salons publics (et les anciennes cibles sans document) sont ouverts.
   */
  async assertSalonAccess(target: string, username: string): Promise<SalonAudience> {
    const salonId = normalizeSalonTarget(target);
    const salon = await this.kivaService.get<SalonDocument>(`salon:${salonId}`);
    if (!salon || salon.visibility === 'public') return { members: null };

    const members = (salon.members || []).map((m) => m.toLowerCase());
    if (members.includes(username) || salon.creator?.toLowerCase() === username) {
      return { members };
    }

    const comm = await this.kivaService.get<CommunityDocument>(`community:${salon.communityId}`);
    const admins = [comm?.creator, ...(comm?.admins || [])].filter(Boolean).map((a) => a!.toLowerCase());
    if (admins.includes(username)) return { members: Array.from(new Set([...members, ...admins])) };

    throw new ForbiddenException("Ce salon est privé : vous n'en êtes pas membre.");
  }

  private sanitizeAttachments(attachments?: MessageAttachment[]): MessageAttachment[] {
    if (!Array.isArray(attachments)) return [];
    if (attachments.length > MAX_ATTACHMENTS) {
      throw new BadRequestException(`Maximum ${MAX_ATTACHMENTS} pièces jointes par message.`);
    }
    return attachments
      .filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/uploads/'))
      .map((a) => ({
        type: ['image', 'video', 'audio', 'document'].includes(a.type) ? a.type : 'document',
        url: a.url,
        name: String(a.name || 'fichier').substring(0, 200),
        size: typeof a.size === 'number' ? a.size : undefined,
        mimeType: a.mimeType,
        duration: typeof a.duration === 'number' ? a.duration : undefined,
      }));
  }

  // ==========================================
  // WRITE
  // ==========================================

  async createMessage(
    from: string,
    to: string,
    content: string,
    attachments?: MessageAttachment[],
  ): Promise<{ message: ChatMessage; audience: string[] | null }> {
    const cleanFrom = from.trim().toLowerCase();
    let cleanTo = to ? to.trim().toLowerCase() : 'general';
    if (cleanTo === 'all') cleanTo = 'general';
    const cleanContent = content ? content.trim() : '';
    const safeAttachments = this.sanitizeAttachments(attachments);

    if (!cleanContent && safeAttachments.length === 0) {
      throw new BadRequestException('Le message doit contenir du texte ou une pièce jointe.');
    }
    if (cleanContent.length > MAX_CONTENT) {
      throw new BadRequestException(`Message trop long (${MAX_CONTENT} caractères maximum).`);
    }

    const isSalon = isSalonTarget(cleanTo);
    let audience: string[] | null = null;
    if (isSalon) {
      audience = (await this.assertSalonAccess(cleanTo, cleanFrom)).members;
    } else {
      if (cleanTo === cleanFrom) {
        throw new BadRequestException('Vous ne pouvez pas vous envoyer un message à vous-même.');
      }
      const target = await this.kivaService.get<UserDocument>(`user:${cleanTo}`);
      if (!target) throw new NotFoundException(`Utilisateur '${cleanTo}' introuvable.`);
    }

    const senderDoc = await this.kivaService.get<UserDocument>(`user:${cleanFrom}`);
    const fromDisplayName = senderDoc?.displayName || cleanFrom;
    const fromAvatar = senderDoc?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanFrom}`;

    // Extract @mentions (e.g. @nathan, @fordimalanda)
    const mentions = Array.from(
      new Set((cleanContent.match(/@([a-zA-Z0-9_-]+)/g) || []).map((m) => m.substring(1).toLowerCase())),
    );

    const timestamp = Date.now();
    const id = `${conversationKey(cleanFrom, cleanTo)}:${timestamp}_${Math.random().toString(36).substring(2, 8)}`;
    const key = `msg:${id}`;

    const messageDoc: ChatMessage = {
      id,
      from: cleanFrom,
      fromDisplayName,
      fromAvatar,
      to: cleanTo,
      content: cleanContent,
      attachments: safeAttachments,
      mentions,
      read: isSalon, // In salon messages are considered viewed by default, in DM unread
      timestamp,
    };

    const saved = await this.kivaService.set(key, messageDoc);
    if (!saved) {
      throw new BadRequestException("Impossible d'enregistrer le message dans KivaDB.");
    }

    this.logger.log(`Message created in KivaDB: [${key}] ${cleanFrom} -> ${cleanTo}`);

    if (!isSalon) {
      this.notificationsService
        .createNotification({
          toUser: cleanTo,
          fromUser: cleanFrom,
          type: 'message',
          title: `Message de ${fromDisplayName}`,
          message: this.previewText(messageDoc, 50),
          link: `/messages?with=${cleanFrom}`,
        })
        .catch((e) => this.logger.error(`Notification error: ${e.message}`));
    }

    for (const mentionedUser of mentions) {
      if (mentionedUser === cleanFrom) continue;
      // Ne notifier une mention de salon privé qu'à ses membres
      if (audience && !audience.includes(mentionedUser)) continue;
      this.notificationsService
        .createNotification({
          toUser: mentionedUser,
          fromUser: cleanFrom,
          type: 'mention',
          title: `@${cleanFrom} vous a mentionné`,
          message: this.previewText(messageDoc, 70),
          link: isSalon ? `/messages?with=${cleanTo}` : `/messages?with=${cleanFrom}`,
        })
        .catch((e) => this.logger.error(`Mention notification error: ${e.message}`));
    }

    return { message: messageDoc, audience };
  }

  /**
   * Suppression (douce) d'un message par son auteur : le contenu est effacé,
   * la trace "message supprimé" reste dans la conversation.
   */
  async deleteMessage(id: string, username: string): Promise<{ message: ChatMessage; audience: string[] | null }> {
    const key = `msg:${id}`;
    const msg = await this.kivaService.get<ChatMessage>(key);
    if (!msg) throw new NotFoundException('Message introuvable.');
    if (msg.from !== username) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres messages.');
    }
    msg.deleted = true;
    msg.content = '';
    msg.attachments = [];
    msg.mentions = [];
    await this.kivaService.set(key, msg);

    const audience = isSalonTarget(msg.to) ? (await this.assertSalonAccess(msg.to, username)).members : null;
    return { message: msg, audience };
  }

  // ==========================================
  // READ
  // ==========================================

  private async loadLegacy(filter: (m: ChatMessage) => boolean): Promise<ChatMessage[]> {
    const raw = await this.kivaService.range<ChatMessage>(LEGACY_RANGE.from, LEGACY_RANGE.to, RANGE_LIMIT);
    return raw.map((i) => i.data).filter((m) => m && m.id && filter(m));
  }

  private async loadConversation(conv: string): Promise<ChatMessage[]> {
    const raw = await this.kivaService.range<ChatMessage>(`msg:${conv}:`, `msg:${conv}:~`, RANGE_LIMIT);
    return raw.map((i) => i.data).filter((m) => m && m.id);
  }

  /** Tous les DM d'un utilisateur (nouveau format + anciens messages) */
  private async loadUserDirectMessages(user: string): Promise<ChatMessage[]> {
    const raw = await this.kivaService.range<ChatMessage>('msg:d.', 'msg:d.~', RANGE_LIMIT);
    const indexed = raw.map((i) => i.data).filter((m) => m && (m.from === user || m.to === user));
    const legacy = await this.loadLegacy(
      (m) => !isSalonTarget(m.to) && (m.from === user || m.to === user),
    );
    return [...legacy, ...indexed];
  }

  /**
   * Messages d'une conversation, paginés du plus récent vers le plus ancien.
   * `before` (timestamp) permet de charger l'historique plus ancien.
   */
  async getMessages(
    currentUser: string | undefined,
    withTarget?: string,
    options: { before?: number; limit?: number } = {},
  ): Promise<MessagePage> {
    const u1 = currentUser?.trim().toLowerCase();
    let target = withTarget ? withTarget.trim().toLowerCase() : 'general';
    if (target === 'all') target = 'general';
    const limit = Math.min(Math.max(options.limit || 50, 1), 200);
    const isSalon = isSalonTarget(target);

    let all: ChatMessage[];
    if (isSalon) {
      if (u1) {
        await this.assertSalonAccess(target, u1);
      } else {
        const salon = await this.kivaService.get<SalonDocument>(`salon:${normalizeSalonTarget(target)}`);
        if (salon && salon.visibility !== 'public') throw new ForbiddenException('Connexion requise.');
      }
      const indexed = await this.loadConversation(conversationKey('', target));
      const legacy = await this.loadLegacy(
        (m) => m.to === target || (target === 'general' && (m.to === 'all' || m.to === 'general')),
      );
      all = [...legacy, ...indexed];
    } else {
      if (!u1) return { messages: [], hasMore: false };
      const indexed = await this.loadConversation(conversationKey(u1, target));
      const legacy = await this.loadLegacy(
        (m) => (m.from === u1 && m.to === target) || (m.from === target && m.to === u1),
      );
      all = [...legacy, ...indexed];
    }

    all.sort((a, b) => a.timestamp - b.timestamp);
    const filtered = options.before ? all.filter((m) => m.timestamp < options.before!) : all;
    const page = filtered.slice(-limit);

    if (!isSalon && u1) {
      await this.markRead(page.filter((m) => m.from === target && m.to === u1 && !m.read), u1, target);
    }

    return { messages: page, hasMore: filtered.length > page.length };
  }

  private async markRead(unread: ChatMessage[], reader: string, sender: string): Promise<number> {
    if (unread.length === 0) return 0;
    const now = Date.now();
    await Promise.all(
      unread.map((msg) => {
        msg.read = true;
        msg.readAt = now;
        return this.kivaService.set(`msg:${msg.id}`, msg);
      }),
    );
    this.eventsGateway.emitToUser(sender, 'message:read', {
      reader,
      partner: sender,
      messageIds: unread.map((m) => m.id),
    });
    return unread.length;
  }

  /**
   * Mark messages as read explicitly
   */
  async markMessagesAsRead(currentUser: string, withUser: string): Promise<number> {
    const reader = currentUser.trim().toLowerCase();
    const sender = withUser.trim().toLowerCase();
    if (isSalonTarget(sender)) return 0;
    const indexed = await this.loadConversation(conversationKey(reader, sender));
    const legacy = await this.loadLegacy((m) => m.from === sender && m.to === reader);
    const unread = [...legacy, ...indexed].filter((m) => m.from === sender && m.to === reader && !m.read);
    return this.markRead(unread, reader, sender);
  }

  /**
   * Count unread direct messages for currentUser
   */
  async getUnreadDirectMessagesCount(currentUser: string): Promise<{ count: number }> {
    const user = currentUser.trim().toLowerCase();
    const msgs = await this.loadUserDirectMessages(user);
    return { count: msgs.filter((m) => m.to === user && !m.read).length };
  }

  /**
   * Summarize user conversations with unread counter
   */
  async getConversations(currentUser: string): Promise<ConversationSummary[]> {
    const user = currentUser.trim().toLowerCase();
    const msgs = await this.loadUserDirectMessages(user);

    const convoMap = new Map<string, ConversationSummary>();
    for (const msg of msgs) {
      const partner = msg.from === user ? msg.to : msg.from;
      if (!partner) continue;
      const isUnread = msg.to === user && !msg.read;
      const existing = convoMap.get(partner);
      if (!existing) {
        convoMap.set(partner, {
          withUser: partner,
          lastMessage: this.previewText(msg, 80),
          lastTimestamp: msg.timestamp,
          messageCount: 1,
          unreadCount: isUnread ? 1 : 0,
        });
        continue;
      }
      existing.messageCount += 1;
      if (isUnread) existing.unreadCount = (existing.unreadCount || 0) + 1;
      if (msg.timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = msg.timestamp;
        existing.lastMessage = this.previewText(msg, 80);
      }
    }

    return Array.from(convoMap.values()).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }

  private previewText(msg: ChatMessage, max: number): string {
    if (msg.deleted) return '🚫 Message supprimé';
    if (msg.content) return msg.content.length > max ? `${msg.content.substring(0, max)}…` : msg.content;
    const first = msg.attachments?.[0];
    if (!first) return 'Message';
    if (first.type === 'audio') return '🎙️ Message vocal';
    if (first.type === 'image') return '📷 Photo';
    if (first.type === 'video') return '🎥 Vidéo';
    return '📎 Fichier';
  }
}
