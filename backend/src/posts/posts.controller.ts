import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { AuthService } from '../auth/auth.service';
import { EventsGateway } from '../events/events.gateway';

export class CreatePostDto {
  content: string;
}

@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
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
  async createPost(
    @Body() dto: CreatePostDto,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) {
      throw new BadRequestException('Vous devez être connecté pour publier.');
    }
    const post = await this.postsService.createPost(current, dto.content);
    this.eventsGateway.broadcastPost(post);
    return post;
  }

  @Get()
  async getPosts() {
    return this.postsService.getPosts();
  }

  @Post(':id/like')
  async toggleLike(
    @Param('id') id: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) {
      throw new BadRequestException('Vous devez être connecté pour aimer une publication.');
    }
    const updated = await this.postsService.toggleLike(id, current);
    this.eventsGateway.broadcastPostUpdated(updated);
    return updated;
  }

  @Delete(':id')
  async deletePost(
    @Param('id') id: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-user') xUser?: string,
  ) {
    const current = this.extractUsername(authHeader, xUser);
    if (!current) {
      throw new BadRequestException('Vous devez être connecté.');
    }
    await this.postsService.deletePost(id, current);
    this.eventsGateway.broadcastPostDeleted(id);
    return { success: true };
  }
}
