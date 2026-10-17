import { Controller, Post, Get, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { PostsService, FeedScope } from './posts.service';
import { EventsGateway } from '../events/events.gateway';
import { CurrentUser } from '../auth/session.guard';
import { RateLimiter } from '../common/rate-limiter';

export class CreatePostDto {
  content: string;
}

export class CreateCommentDto {
  content: string;
}

@Controller('posts')
export class PostsController {
  /** Anti-spam : 5 publications / minute, 20 commentaires / minute */
  private readonly postLimiter = new RateLimiter(5, 60_000);
  private readonly commentLimiter = new RateLimiter(20, 60_000);

  constructor(
    private readonly postsService: PostsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Post()
  async createPost(
    @Body() dto: CreatePostDto,
    @CurrentUser({ required: true }) current: string,
  ) {
    this.postLimiter.hit(current);
    const post = await this.postsService.createPost(current, dto.content);
    this.eventsGateway.broadcastPost(post);
    return post;
  }

  /**
   * GET /posts?scope=all|following&author=<username>&tag=<hashtag>
   */
  @Get()
  async getPosts(
    @Query('scope') scope?: FeedScope,
    @Query('author') author?: string,
    @Query('tag') tag?: string,
    @CurrentUser() current?: string,
  ) {
    return this.postsService.getPosts({ currentUser: current, scope, author, tag });
  }

  @Get('trending')
  async getTrending() {
    return this.postsService.getTrendingHashtags();
  }

  @Put(':id')
  async updatePost(
    @Param('id') id: string,
    @Body() dto: CreatePostDto,
    @CurrentUser({ required: true }) current: string,
  ) {
    const updated = await this.postsService.updatePost(id, current, dto.content);
    this.eventsGateway.broadcastPostUpdated(updated);
    return updated;
  }

  @Post(':id/like')
  async toggleLike(
    @Param('id') id: string,
    @CurrentUser({ required: true }) current: string,
  ) {
    const updated = await this.postsService.toggleLike(id, current);
    this.eventsGateway.broadcastPostUpdated(updated);
    return updated;
  }

  @Delete(':id')
  async deletePost(
    @Param('id') id: string,
    @CurrentUser({ required: true }) current: string,
  ) {
    await this.postsService.deletePost(id, current);
    this.eventsGateway.broadcastPostDeleted(id);
    return { success: true };
  }

  @Get(':id/comments')
  async getComments(@Param('id') id: string) {
    return this.postsService.getComments(id);
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser({ required: true }) current: string,
  ) {
    this.commentLimiter.hit(current);
    const { comment, post } = await this.postsService.addComment(id, current, dto.content);
    this.eventsGateway.server?.emit('post:comment', comment);
    this.eventsGateway.broadcastPostUpdated(post);
    return comment;
  }

  @Delete(':id/comments/:commentId')
  async deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser({ required: true }) current: string,
  ) {
    const post = await this.postsService.deleteComment(id, commentId, current);
    this.eventsGateway.server?.emit('post:comment_deleted', { postId: id, id: commentId });
    this.eventsGateway.broadcastPostUpdated(post);
    return { success: true };
  }
}
