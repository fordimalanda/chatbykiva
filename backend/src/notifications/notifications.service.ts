import { Injectable, Logger } from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { EventsGateway } from '../events/events.gateway';
import { UserDocument } from '../auth/auth.service';

export interface NotificationItem {
  id: string;
  toUser: string;
  fromUser: string;
  fromDisplayName?: string;
  fromAvatar?: string;
  type: 'mention' | 'message' | 'invite' | 'like' | 'follow' | 'join_request';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly kivaService: KivaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Create a notification in KivaDB and emit via WebSocket
   */
  async createNotification(data: {
    toUser: string;
    fromUser: string;
    type: 'mention' | 'message' | 'invite' | 'like' | 'follow' | 'join_request';
    title: string;
    message: string;
    link?: string;
  }): Promise<NotificationItem | null> {
    const to = data.toUser.trim().toLowerCase();
    const from = data.fromUser.trim().toLowerCase();

    // Do not notify self
    if (to === from) return null;

    const senderDoc = await this.kivaService.get<UserDocument>(`user:${from}`);
    const fromDisplayName = senderDoc?.displayName || from;
    const fromAvatar = senderDoc?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${from}`;

    const timestamp = Date.now();
    const id = `${timestamp}_${Math.random().toString(36).substring(2, 8)}`;
    const key = `notif:${to}:${id}`;

    const notification: NotificationItem = {
      id,
      toUser: to,
      fromUser: from,
      fromDisplayName,
      fromAvatar,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link,
      read: false,
      createdAt: timestamp,
    };

    await this.kivaService.set(key, notification);

    // Emit live event to user's personal room
    this.eventsGateway.server?.to(`user:${to}`).emit('notification:new', notification);
    this.logger.log(`Notification created: [${key}] for ${to} (${data.type})`);

    return notification;
  }

  /**
   * Get all notifications for a user
   */
  async getUserNotifications(username: string): Promise<NotificationItem[]> {
    const cleanUser = username.trim().toLowerCase();
    const rawItems = await this.kivaService.range<NotificationItem>(
      `notif:${cleanUser}:`,
      `notif:${cleanUser}:~`,
      200
    );

    const list: NotificationItem[] = [];
    for (const item of rawItems) {
      if (!item.key.startsWith(`notif:${cleanUser}:`)) continue;
      if (item.data && item.data.id) {
        list.push(item.data);
      }
    }

    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get unread count
   */
  async getUnreadCount(username: string): Promise<{ count: number }> {
    const list = await this.getUserNotifications(username);
    const unread = list.filter((n) => !n.read).length;
    return { count: unread };
  }

  /**
   * Mark single notification as read
   */
  async markAsRead(id: string, username: string): Promise<boolean> {
    const cleanUser = username.trim().toLowerCase();
    const key = `notif:${cleanUser}:${id}`;
    const notif = await this.kivaService.get<NotificationItem>(key);
    if (notif) {
      notif.read = true;
      await this.kivaService.set(key, notif);
      this.eventsGateway.server?.to(`user:${cleanUser}`).emit('notification:updated', notif);
      return true;
    }
    return false;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(username: string): Promise<boolean> {
    const cleanUser = username.trim().toLowerCase();
    const list = await this.getUserNotifications(cleanUser);
    for (const notif of list) {
      if (!notif.read) {
        notif.read = true;
        await this.kivaService.set(`notif:${cleanUser}:${notif.id}`, notif);
      }
    }
    this.eventsGateway.server?.to(`user:${cleanUser}`).emit('notification:all_read', { username: cleanUser });
    return true;
  }
}
