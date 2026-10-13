import { Controller, Post, Get, Body, Query, Headers, BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { AuthService } from '../auth/auth.service';

export class CreateMessageDto {
  to?: string;
  content: string;
}

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
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
    return this.messagesService.createMessage(current, dto.to || 'all', dto.content);
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
