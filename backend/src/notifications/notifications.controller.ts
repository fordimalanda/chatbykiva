import { Controller, Get, Post, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/session.guard';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(@CurrentUser({ required: true }) current: string) {
    return this.notificationsService.getUserNotifications(current);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() current?: string) {
    if (!current) return { count: 0 };
    return this.notificationsService.getUnreadCount(current);
  }

  @Post(':id/read')
  async markAsRead(@Param('id') id: string, @CurrentUser({ required: true }) current: string) {
    return { success: await this.notificationsService.markAsRead(id, current) };
  }

  @Post('read-all')
  async markAllAsRead(@CurrentUser({ required: true }) current: string) {
    return { success: await this.notificationsService.markAllAsRead(current) };
  }
}
