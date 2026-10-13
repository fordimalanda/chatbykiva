import {
  Controller,
  Get,
  Post,
  Param,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthService } from '../auth/auth.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthService,
  ) {}

  private extractUsername(authHeader?: string, xUserHeader?: string): string | undefined {
    if (xUserHeader) return xUserHeader;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const username = this.authService.validateToken(token);
      if (username) return username;
    }
    return undefined;
  }

  @Get()
  async getNotifications(
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) throw new BadRequestException('Vous devez être connecté.');
    return this.notificationsService.getUserNotifications(current);
  }

  @Get('unread-count')
  async getUnreadCount(
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) return { count: 0 };
    return this.notificationsService.getUnreadCount(current);
  }

  @Post(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) throw new BadRequestException('Vous devez être connecté.');
    return { success: await this.notificationsService.markAsRead(id, current) };
  }

  @Post('read-all')
  async markAllAsRead(
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) throw new BadRequestException('Vous devez être connecté.');
    return { success: await this.notificationsService.markAllAsRead(current) };
  }
}
