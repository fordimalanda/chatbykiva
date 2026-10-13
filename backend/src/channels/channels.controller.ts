import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { AuthService } from '../auth/auth.service';
import { EventsGateway } from '../events/events.gateway';

export class CreateChannelDto {
  name: string;
  description?: string;
  isPrivate?: boolean;
}

export class UpdateChannelDto {
  name?: string;
  description?: string;
  isPrivate?: boolean;
  members?: string[];
}

@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
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

  @Get()
  async getChannels(
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    return this.channelsService.getChannels(current);
  }

  @Post()
  async createChannel(
    @Body() dto: CreateChannelDto,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) {
      throw new BadRequestException('Vous devez être connecté pour créer un salon.');
    }
    const channel = await this.channelsService.createChannel(current, dto);
    this.eventsGateway.server?.emit('channel:new', channel);
    return channel;
  }

  @Put(':id')
  async updateChannel(
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) {
      throw new BadRequestException('Vous devez être connecté.');
    }
    const updated = await this.channelsService.updateChannel(id, current, dto);
    this.eventsGateway.server?.emit('channel:updated', updated);
    return updated;
  }

  @Delete(':id')
  async deleteChannel(
    @Param('id') id: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) {
      throw new BadRequestException('Vous devez être connecté.');
    }
    await this.channelsService.deleteChannel(id, current);
    this.eventsGateway.server?.emit('channel:deleted', { id });
    return { success: true };
  }
}
