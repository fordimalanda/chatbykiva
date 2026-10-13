import { Injectable, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { UserDocument } from '../auth/auth.service';
import { EventsGateway } from '../events/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';

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
  timestamp: number;
}

export interface ConversationSummary {
  withUser: string;
  lastMessage: string;
  lastTimestamp: number;
  messageCount: number;
  unreadCount?: number;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly kivaService: KivaService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly eventsGateway: EventsGateway,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Save a new message in KivaDB under msg:<id>
   */
  async createMessage(
    from: string,
    to: string,
    content: string,
    attachments?: MessageAttachment[]
  ): Promise<ChatMessage> {
    const cleanFrom = from.trim().toLowerCase();
    const cleanTo = to ? to.trim().toLowerCase() : 'general';
    const cleanContent = content ? content.trim() : '';
    const safeAttachments = Array.isArray(attachments) ? attachments : [];

    if (!cleanContent && safeAttachments.length === 0) {
      throw new BadRequestException('Le message doit contenir du texte ou une pièce jointe.');
    }

    // Get sender full profile from KivaDB to attach displayName & avatar
    const senderDoc = await this.kivaService.get<UserDocument>(`user:${cleanFrom}`);
    const fromDisplayName = senderDoc?.displayName || cleanFrom;
    const fromAvatar = senderDoc?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanFrom}`;

    // Extract @mentions (e.g. @nathan, @fordimalanda)
    const mentionMatches = cleanContent.match(/@([a-zA-Z0-9_-]+)/g);
    const mentions: string[] = [];
    if (mentionMatches) {
      for (const m of mentionMatches) {
        const username = m.substring(1).toLowerCase();
        if (!mentions.includes(username)) {
          mentions.push(username);
        }
      }
    }

    const timestamp = Date.now();
    const id = `${timestamp}_${Math.random().toString(36).substring(2, 8)}`;
    const key = `msg:${id}`;

    const isSalon =
      cleanTo === 'all' ||
      cleanTo === 'general' ||
      cleanTo.startsWith('s-') ||
      cleanTo.startsWith('c-') ||
      cleanTo.startsWith('salon:') ||
      cleanTo.startsWith('channel:');

    const messageDoc: ChatMessage = {
      id,
      from: cleanFrom,
      fromDisplayName,
      fromAvatar,
      to: cleanTo,
      content: cleanContent,
      attachments: safeAttachments,
      mentions,
      read: isSalon ? true : false, // In salon messages are considered viewed by default, in DM unread
      timestamp,
    };

    const saved = await this.kivaService.set(key, messageDoc);
    if (!saved) {
      throw new BadRequestException("Impossible d'enregistrer le message dans KivaDB.");
    }

    this.logger.log(`Message created in KivaDB: [${key}] ${cleanFrom} (${fromDisplayName}) -> ${cleanTo}`);

    // Trigger Notifications
    if (!isSalon && cleanTo !== cleanFrom) {
      // Direct message notification
      const summaryText = cleanContent
        ? (cleanContent.length > 50 ? `${cleanContent.substring(0, 50)}...` : cleanContent)
        : safeAttachments[0]?.type === 'audio'
        ? 'Message vocal reçu 🎙️'
        : safeAttachments[0]?.type === 'image'
        ? 'Photo reçue 📷'
        : safeAttachments[0]?.type === 'video'
        ? 'Vidéo reçue 🎥'
        : 'Fichier reçu 📎';

      this.notificationsService.createNotification({
        toUser: cleanTo,
        fromUser: cleanFrom,
        type: 'message',
        title: `Message de ${fromDisplayName}`,
        message: summaryText,
        link: `/messages?with=${cleanFrom}`,
      }).catch((e) => this.logger.error(`Notification error: ${e.message}`));
    }

    // Mention notifications
    if (mentions.length > 0) {
      for (const mentionedUser of mentions) {
        if (mentionedUser !== cleanFrom) {
          this.notificationsService.createNotification({
            toUser: mentionedUser,
            fromUser: cleanFrom,
            type: 'mention',
            title: `@${cleanFrom} vous a mentionné`,
            message: cleanContent.length > 70 ? `${cleanContent.substring(0, 70)}...` : cleanContent,
            link: isSalon ? `/messages?with=${cleanTo}` : `/messages?with=${cleanFrom}`,
          }).catch((e) => this.logger.error(`Mention notification error: ${e.message}`));
        }
      }
    }

    return messageDoc;
  }

  /**
   * Retrieve messages from KivaDB and auto-mark as read for DMs
   */
  async getMessages(currentUser?: string, withTarget?: string): Promise<ChatMessage[]> {
    const rawItems = await this.kivaService.range<ChatMessage>('msg:', 'msg:~', 1000);
    const messages: ChatMessage[] = [];

    const u1 = currentUser?.trim().toLowerCase();
    const target = withTarget ? withTarget.trim().toLowerCase() : 'general';

    const isSalon =
      target === 'all' ||
      target === 'general' ||
      target.startsWith('channel:') ||
      target.startsWith('c-') ||
      target.startsWith('salon:') ||
      target.startsWith('s-');

    const readMessageIdsToUpdate: string[] = [];

    for (const item of rawItems) {
      if (!item.key.startsWith('msg:')) continue;
      const msg = item.data;
      if (!msg) continue;

      if (isSalon) {
        // Salon / Channel messages
        const isMatch =
          msg.to === target ||
          ((target === 'all' || target === 'general') && (msg.to === 'all' || msg.to === 'general'));
        if (isMatch) {
          messages.push(msg);
        }
      } else {
        // Direct conversation between u1 and target ONLY
        if (u1) {
          const isDirect =
            (msg.from === u1 && msg.to === target) ||
            (msg.from === target && msg.to === u1);
          if (isDirect) {
            // If message was sent from target to u1, mark as read!
            if (msg.from === target && msg.to === u1 && !msg.read) {
              msg.read = true;
              msg.readAt = Date.now();
              readMessageIdsToUpdate.push(msg.id);
              // Save in KivaDB
              this.kivaService.set(`msg:${msg.id}`, msg).catch(console.error);
            }
            messages.push(msg);
          }
        }
      }
    }

    // If any messages were marked as read, broadcast to sender via Socket.IO!
    if (readMessageIdsToUpdate.length > 0 && u1 && !isSalon) {
      this.eventsGateway.server?.to(`user:${target}`).emit('message:read', {
        reader: u1,
        partner: target,
        messageIds: readMessageIdsToUpdate,
      });
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Mark messages as read explicitly
   */
  async markMessagesAsRead(currentUser: string, withUser: string): Promise<number> {
    const reader = currentUser.trim().toLowerCase();
    const sender = withUser.trim().toLowerCase();
    const rawItems = await this.kivaService.range<ChatMessage>('msg:', 'msg:~', 1000);

    const updatedIds: string[] = [];
    for (const item of rawItems) {
      if (!item.key.startsWith('msg:')) continue;
      const msg = item.data;
      if (msg && msg.from === sender && msg.to === reader && !msg.read) {
        msg.read = true;
        msg.readAt = Date.now();
        await this.kivaService.set(`msg:${msg.id}`, msg);
        updatedIds.push(msg.id);
      }
    }

    if (updatedIds.length > 0) {
      this.eventsGateway.server?.to(`user:${sender}`).emit('message:read', {
        reader,
        partner: sender,
        messageIds: updatedIds,
      });
    }

    return updatedIds.length;
  }

  /**
   * Count unread direct messages for currentUser
   */
  async getUnreadDirectMessagesCount(currentUser: string): Promise<{ count: number }> {
    const user = currentUser.trim().toLowerCase();
    const rawItems = await this.kivaService.range<ChatMessage>('msg:', 'msg:~', 1000);
    let count = 0;

    for (const item of rawItems) {
      if (!item.key.startsWith('msg:')) continue;
      const msg = item.data;
      if (msg && msg.to === user && !msg.read) {
        count++;
      }
    }

    return { count };
  }

  /**
   * Summarize user conversations with unread counter
   */
  async getConversations(currentUser: string): Promise<ConversationSummary[]> {
    const user = currentUser.trim().toLowerCase();
    const rawItems = await this.kivaService.range<ChatMessage>('msg:', 'msg:~', 1000);

    const convoMap = new Map<
      string,
      { lastMessage: string; lastTimestamp: number; count: number; unreadCount: number }
    >();

    for (const item of rawItems) {
      if (!item.key.startsWith('msg:')) continue;
      const msg = item.data;
      if (!msg) continue;

      let partner: string | null = null;
      const isSalonMsg =
        msg.to === 'all' ||
        msg.to === 'general' ||
        msg.to.startsWith('s-') ||
        msg.to.startsWith('c-') ||
        msg.to.startsWith('salon:') ||
        msg.to.startsWith('channel:');

      if (isSalonMsg) continue;

      const isIncoming = msg.to === user && msg.from;
      if (msg.from === user && msg.to) {
        partner = msg.to;
      } else if (isIncoming) {
        partner = msg.from;
      }

      if (partner) {
        const isUnread = isIncoming && !msg.read;
        const displayLast = msg.content
          ? msg.content
          : msg.attachments && msg.attachments.length > 0
          ? msg.attachments[0].type === 'audio'
            ? '🎙️ Message vocal'
            : msg.attachments[0].type === 'image'
            ? '📷 Photo'
            : msg.attachments[0].type === 'video'
            ? '🎥 Vidéo'
            : '📎 Fichier'
          : 'Message';

        const existing = convoMap.get(partner);
        if (!existing || msg.timestamp > existing.lastTimestamp) {
          convoMap.set(partner, {
            lastMessage: displayLast,
            lastTimestamp: msg.timestamp,
            count: (existing?.count || 0) + 1,
            unreadCount: (existing?.unreadCount || 0) + (isUnread ? 1 : 0),
          });
        } else {
          existing.count += 1;
          if (isUnread) existing.unreadCount += 1;
        }
      }
    }

    const result: ConversationSummary[] = [];
    for (const [withUser, data] of convoMap.entries()) {
      result.push({
        withUser,
        lastMessage: data.lastMessage,
        lastTimestamp: data.lastTimestamp,
        messageCount: data.count,
        unreadCount: data.unreadCount,
      });
    }

    return result.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }
}
