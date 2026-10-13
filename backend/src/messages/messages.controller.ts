import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { MessagesService, MessageAttachment } from './messages.service';
import { AuthService } from '../auth/auth.service';
import { EventsGateway } from '../events/events.gateway';

export class CreateMessageDto {
  to?: string;
  content?: string;
  attachments?: MessageAttachment[];
}

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly authService: AuthService,
    private readonly eventsGateway: EventsGateway,
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

  @Post()
  async sendMessage(
    @Body() dto: CreateMessageDto,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) {
      throw new BadRequestException('Vous devez être connecté pour envoyer un message.');
    }
    const msg = await this.messagesService.createMessage(
      current,
      dto.to || 'all',
      dto.content || '',
      dto.attachments
    );
    this.eventsGateway.broadcastMessage(msg);
    return msg;
  }

  @Get()
  async getMessages(
    @Query('with') withUser?: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    return this.messagesService.getMessages(current, withUser);
  }

  @Get('unread-count')
  async getUnreadCount(
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) return { count: 0 };
    return this.messagesService.getUnreadDirectMessagesCount(current);
  }

  @Post('read')
  async markRead(
    @Body() body: { withUser: string },
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) throw new BadRequestException('Vous devez être connecté.');
    if (!body?.withUser) throw new BadRequestException('withUser requis.');
    const updatedCount = await this.messagesService.markMessagesAsRead(current, body.withUser);
    return { success: true, count: updatedCount };
  }

  @Get('conversations')
  async getConversations(
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) {
      return [];
    }
    return this.messagesService.getConversations(current);
  }
}
