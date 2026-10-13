import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';

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

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly kivaService: KivaService) {}

  /**
   * Save a new message in KivaDB under msg:<id>
   */
  async createMessage(from: string, to: string, content: string): Promise<ChatMessage> {
    const cleanFrom = from.trim().toLowerCase();
    const cleanTo = to ? to.trim().toLowerCase() : 'all';
    const cleanContent = content ? content.trim() : '';

    if (!cleanContent) {
      throw new BadRequestException('Le contenu du message ne peut pas être vide.');
    }

    const timestamp = Date.now();
    const id = `${timestamp}_${Math.random().toString(36).substring(2, 8)}`;
    const key = `msg:${id}`;

    const messageDoc: ChatMessage = {
      id,
      from: cleanFrom,
      to: cleanTo,
      content: cleanContent,
      timestamp,
    };

    const saved = await this.kivaService.set(key, messageDoc);
    if (!saved) {
      throw new BadRequestException("Impossible d'enregistrer le message dans KivaDB.");
    }

    this.logger.log(`Message created in KivaDB: [${key}] ${cleanFrom} -> ${cleanTo}`);
    return messageDoc;
  }

  /**
   * Retrieve messages from KivaDB
   */
  async getMessages(currentUser?: string, withUser?: string): Promise<ChatMessage[]> {
    const rawItems = await this.kivaService.range<ChatMessage>('msg:', 'msg:~', 1000);
    const messages: ChatMessage[] = [];

    const u1 = currentUser?.trim().toLowerCase();
    const u2 = withUser?.trim().toLowerCase();

    for (const item of rawItems) {
      if (!item.key.startsWith('msg:')) continue;
      const msg = item.data;
      if (!msg || !msg.content) continue;

      if (u2 && u2 !== 'all') {
        // Direct conversation between u1 and u2 ONLY
        if (u1) {
          const isDirect =
            (msg.from === u1 && msg.to === u2) ||
            (msg.from === u2 && msg.to === u1);
          if (isDirect) {
            messages.push(msg);
          }
        }
      } else {
        // Public salon: messages sent to "all" only
        if (msg.to === 'all') {
          messages.push(msg);
        }
      }
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Summarize user conversations
   */
  async getConversations(currentUser: string): Promise<ConversationSummary[]> {
    const user = currentUser.trim().toLowerCase();
    const rawItems = await this.kivaService.range<ChatMessage>('msg:', 'msg:~', 1000);

    const convoMap = new Map<string, { lastMessage: string; lastTimestamp: number; count: number }>();

    for (const item of rawItems) {
      if (!item.key.startsWith('msg:')) continue;
      const msg = item.data;
      if (!msg || !msg.content) continue;

      let partner: string | null = null;
      if (msg.from === user && msg.to && msg.to !== 'all') {
        partner = msg.to;
      } else if (msg.to === user && msg.from) {
        partner = msg.from;
      }

      if (partner) {
        const existing = convoMap.get(partner);
        if (!existing || msg.timestamp > existing.lastTimestamp) {
          convoMap.set(partner, {
            lastMessage: msg.content,
            lastTimestamp: msg.timestamp,
            count: (existing?.count || 0) + 1,
          });
        } else {
          existing.count += 1;
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
      });
    }

    return result.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }
}
