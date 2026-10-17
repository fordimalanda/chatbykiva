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
import { CommunitiesService, SalonVisibility } from './communities.service';
import { CurrentUser } from '../auth/session.guard';
import { EventsGateway } from '../events/events.gateway';

export class CreateCommunityDto {
  name: string;
  description?: string;
  isPrivate?: boolean;
}

export class UpdateCommunityDto {
  name?: string;
  description?: string;
  isPrivate?: boolean;
}

export class CreateSalonDto {
  name: string;
  description?: string;
  visibility?: SalonVisibility;
}

export class UpdateSalonDto {
  name?: string;
  description?: string;
  visibility?: SalonVisibility;
}

@Controller('communities')
export class CommunitiesController {
  constructor(
    private readonly communitiesService: CommunitiesService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Get()
  async getCommunities(
    @CurrentUser() current?: string,
  ) {
    return this.communitiesService.getCommunities(current);
  }

  @Post()
  async createCommunity(
    @Body() dto: CreateCommunityDto,
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    const comm = await this.communitiesService.createCommunity(current, dto);
    this.eventsGateway.server?.emit('community:new', comm);
    return comm;
  }

  @Get(':id')
  async getCommunity(@Param('id') id: string) {
    return this.communitiesService.getCommunityById(id);
  }

  @Put(':id')
  async updateCommunity(
    @Param('id') id: string,
    @Body() dto: UpdateCommunityDto,
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    const updated = await this.communitiesService.updateCommunity(id, current, dto);
    this.eventsGateway.server?.emit('community:updated', updated);
    return updated;
  }

  @Delete(':id')
  async deleteCommunity(
    @Param('id') id: string,
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    await this.communitiesService.deleteCommunity(id, current);
    this.eventsGateway.server?.emit('community:deleted', { id });
    return { success: true };
  }

  @Post(':id/invite')
  async inviteUser(
    @Param('id') id: string,
    @Body() body: { username: string },
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    if (!body?.username) throw new BadRequestException("Nom d'utilisateur requis.");
    const updated = await this.communitiesService.inviteUserToCommunity(id, current, body.username);
    this.eventsGateway.server?.emit('community:updated', updated);
    this.eventsGateway.server?.emit(`community:invite:${body.username.toLowerCase()}`, { communityId: id });
    return updated;
  }

  @Post(':id/respond-invite')
  async respondInvite(
    @Param('id') id: string,
    @Body() body: { accept: boolean },
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    const updated = await this.communitiesService.respondToInvite(id, current, !!body?.accept);
    this.eventsGateway.server?.emit('community:updated', updated);
    return updated;
  }

  @Post(':id/join')
  async joinCommunity(
    @Param('id') id: string,
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    const updated = await this.communitiesService.joinCommunity(id, current);
    this.eventsGateway.server?.emit('community:updated', updated);
    return updated;
  }

  @Post(':id/admins')
  async toggleAdmin(
    @Param('id') id: string,
    @Body() body: { username: string },
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    if (!body?.username) throw new BadRequestException("Nom d'utilisateur requis.");
    const updated = await this.communitiesService.toggleAdmin(id, current, body.username);
    this.eventsGateway.server?.emit('community:updated', updated);
    return updated;
  }

  // ==========================================
  // SALONS ENDPOINTS
  // ==========================================

  @Get(':id/salons')
  async getSalons(
    @Param('id') id: string,
    @CurrentUser() current?: string,
  ) {
    return this.communitiesService.getSalonsForCommunity(id, current);
  }

  @Post(':id/salons')
  async createSalon(
    @Param('id') id: string,
    @Body() dto: CreateSalonDto,
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    const salon = await this.communitiesService.createSalon(id, current, dto);
    this.eventsGateway.server?.emit('salon:new', salon);
    return salon;
  }

  @Put(':id/salons/:salonId')
  async updateSalon(
    @Param('id') id: string,
    @Param('salonId') salonId: string,
    @Body() dto: UpdateSalonDto,
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    const updated = await this.communitiesService.updateSalon(id, salonId, current, dto);
    this.eventsGateway.server?.emit('salon:updated', updated);
    return updated;
  }

  @Delete(':id/salons/:salonId')
  async deleteSalon(
    @Param('id') id: string,
    @Param('salonId') salonId: string,
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    await this.communitiesService.deleteSalon(id, salonId, current);
    this.eventsGateway.server?.emit('salon:deleted', { communityId: id, salonId });
    return { success: true };
  }

  @Post(':id/salons/:salonId/members')
  async addMemberToSalon(
    @Param('id') id: string,
    @Param('salonId') salonId: string,
    @Body() body: { username: string },
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    if (!body?.username) throw new BadRequestException("Nom d'utilisateur requis.");
    const updated = await this.communitiesService.addMemberToSalon(id, salonId, current, body.username);
    this.eventsGateway.server?.emit('salon:updated', updated);
    return updated;
  }

  @Post(':id/salons/:salonId/join-request')
  async requestJoinSalon(
    @Param('id') id: string,
    @Param('salonId') salonId: string,
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    const updated = await this.communitiesService.requestJoinSalon(id, salonId, current);
    this.eventsGateway.server?.emit('salon:updated', updated);
    return updated;
  }

  @Post(':id/salons/:salonId/respond-join')
  async respondJoinSalon(
    @Param('id') id: string,
    @Param('salonId') salonId: string,
    @Body() body: { username: string; approve: boolean },
    @CurrentUser() current?: string,
  ) {
    if (!current) throw new UnauthorizedException('Vous devez être connecté.');
    if (!body?.username) throw new BadRequestException("Nom d'utilisateur requis.");
    const updated = await this.communitiesService.respondToSalonJoinRequest(
      id,
      salonId,
      current,
      body.username,
      !!body?.approve
    );
    this.eventsGateway.server?.emit('salon:updated', updated);
    return updated;
  }
}
