import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { MessagesService, MessageAttachment } from './messages.service';
import { EventsGateway } from '../events/events.gateway';
import { CurrentUser } from '../auth/session.guard';
import { RateLimiter } from '../common/rate-limiter';

export class CreateMessageDto {
  to?: string;
  content?: string;
  attachments?: MessageAttachment[];
}

@Controller('messages')
export class MessagesController {
  /** Anti-spam : 30 messages / 10 s par utilisateur */
  private readonly sendLimiter = new RateLimiter(30, 10_000);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Post()
  async sendMessage(
    @Body() dto: CreateMessageDto,
    @CurrentUser({ required: true }) current: string,
  ) {
    this.sendLimiter.hit(current);
    const { message, audience } = await this.messagesService.createMessage(
      current,
      dto.to || 'general',
      dto.content || '',
      dto.attachments,
    );
    this.eventsGateway.broadcastMessage(message, audience);
    return message;
  }

  /**
   * GET /messages?with=<target>&before=<timestamp>&limit=50
   * Rétro-compatible : renvoie un tableau ; la pagination est exposée via /messages/page.
   */
  @Get()
  async getMessages(
    @Query('with') withUser?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
    @CurrentUser() current?: string,
  ) {
    const page = await this.messagesService.getMessages(current, withUser, {
      before: before ? Number(before) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return page.messages;
  }

  @Get('page')
  async getMessagesPage(
    @Query('with') withUser?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
    @CurrentUser() current?: string,
  ) {
    return this.messagesService.getMessages(current, withUser, {
      before: before ? Number(before) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() current?: string) {
    if (!current) return { count: 0 };
    return this.messagesService.getUnreadDirectMessagesCount(current);
  }

  @Post('read')
  async markRead(
    @Body() body: { withUser: string },
    @CurrentUser({ required: true }) current: string,
  ) {
    if (!body?.withUser) throw new BadRequestException('withUser requis.');
    const updatedCount = await this.messagesService.markMessagesAsRead(current, body.withUser);
    return { success: true, count: updatedCount };
  }

  @Get('conversations')
  async getConversations(@CurrentUser() current?: string) {
    if (!current) return [];
    return this.messagesService.getConversations(current);
  }

  @Delete(':id')
  async deleteMessage(
    @Param('id') id: string,
    @CurrentUser({ required: true }) current: string,
  ) {
    const { message, audience } = await this.messagesService.deleteMessage(id, current);
    this.eventsGateway.broadcastMessage(message, audience, 'message:deleted');
    return message;
  }
}
