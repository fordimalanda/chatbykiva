import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CurrentUser } from '../auth/session.guard';
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
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Get()
  async getChannels(
    @CurrentUser() current?: string,
  ) {
    return this.channelsService.getChannels(current);
  }

  @Post()
  async createChannel(
    @Body() dto: CreateChannelDto,
    @CurrentUser() current?: string,
  ) {
    if (!current) {
      throw new UnauthorizedException('Vous devez être connecté pour créer un salon.');
    }
    const channel = await this.channelsService.createChannel(current, dto);
    this.eventsGateway.server?.emit('channel:new', channel);
    return channel;
  }

  @Put(':id')
  async updateChannel(
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
    @CurrentUser() current?: string,
  ) {
    if (!current) {
      throw new UnauthorizedException('Vous devez être connecté.');
    }
    const updated = await this.channelsService.updateChannel(id, current, dto);
    this.eventsGateway.server?.emit('channel:updated', updated);
    return updated;
  }

  @Delete(':id')
  async deleteChannel(
    @Param('id') id: string,
    @CurrentUser() current?: string,
  ) {
    if (!current) {
      throw new UnauthorizedException('Vous devez être connecté.');
    }
    await this.channelsService.deleteChannel(id, current);
    this.eventsGateway.server?.emit('channel:deleted', { id });
    return { success: true };
  }
}
