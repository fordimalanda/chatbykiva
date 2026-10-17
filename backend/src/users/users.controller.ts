import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { UsersService, UpdateProfileDto } from './users.service';
import { EventsGateway } from '../events/events.gateway';
import { CurrentUser } from '../auth/session.guard';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Get()
  async getUsers(@CurrentUser() current?: string) {
    return this.usersService.findAll(current);
  }

  /** Utilisateurs en ligne + "vu pour la dernière fois" */
  @Get('presence')
  getPresence() {
    return this.eventsGateway.getPresence();
  }

  /** Suggestions : amis d'amis, triés par nombre de relations communes */
  @Get('suggestions')
  async getSuggestions(@CurrentUser({ required: true }) current: string) {
    return this.usersService.getSuggestions(current);
  }

  @Patch('me')
  async updateMe(@Body() dto: UpdateProfileDto, @CurrentUser({ required: true }) current: string) {
    return this.usersService.updateProfile(current, dto);
  }

  @Get(':username/profile')
  async getProfile(@Param('username') username: string, @CurrentUser() current?: string) {
    return this.usersService.findByUsername(username, current);
  }

  @Post(':username/follow')
  async follow(@Param('username') username: string, @CurrentUser({ required: true }) current: string) {
    return this.usersService.toggleFollow(username, current);
  }
}
