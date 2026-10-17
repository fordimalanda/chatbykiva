import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { UserDocument } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface PostItem {
  id: string;
  author: string;
  displayName: string;
  avatar: string;
  content: string;
  likes: string[];
  likesCount: number;
  commentsCount: number;
  hashtags?: string[];
  timestamp: number;
  editedAt?: number;
}

/**
 * Commentaire stocké sous comment:<postId>:<timestamp>_<rand>
 * → un range KivaDB sur le préfixe du post lit tous ses commentaires.
 */
export interface CommentItem {
  id: string;
  postId: string;
  author: string;
  displayName: string;
  avatar: string;
  content: string;
  timestamp: number;
}

export type FeedScope = 'all' | 'following';

const MAX_POST = 1000;
const MAX_COMMENT = 500;

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly kivaService: KivaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private extractHashtags(content: string): string[] {
    return Array.from(
      new Set((content.match(/#([\p{L}0-9_]{2,40})/gu) || []).map((h) => h.substring(1).toLowerCase())),
    );
  }

  private async authorInfo(username: string) {
    const userDoc = await this.kivaService.get<UserDocument>(`user:${username}`);
    return {
      displayName: userDoc?.displayName || username,
      avatar: userDoc?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
    };
  }

  /**
   * Create a post in KivaDB stored under post:<id>
   */
  async createPost(username: string, content: string): Promise<PostItem> {
    const cleanUser = username.trim().toLowerCase();
    const cleanContent = content ? content.trim() : '';

    if (!cleanContent) {
      throw new BadRequestException('Le contenu de la publication ne peut pas être vide.');
    }
    if (cleanContent.length > MAX_POST) {
      throw new BadRequestException(`Publication trop longue (${MAX_POST} caractères maximum).`);
    }

    const { displayName, avatar } = await this.authorInfo(cleanUser);
    const timestamp = Date.now();
    const id = `${timestamp}_${Math.random().toString(36).substring(2, 8)}`;
    const key = `post:${id}`;

    const postDoc: PostItem = {
      id,
      author: cleanUser,
      displayName,
      avatar,
      content: cleanContent,
      likes: [],
      likesCount: 0,
      commentsCount: 0,
      hashtags: this.extractHashtags(cleanContent),
      timestamp,
    };

    const saved = await this.kivaService.set(key, postDoc);
    if (!saved) {
      throw new BadRequestException("Impossible d'enregistrer la publication dans KivaDB.");
    }

    this.logger.log(`Post created in KivaDB: [${key}] by ${cleanUser}`);
    return postDoc;
  }

  /**
   * Fil d'actualité avec filtres :
   * - scope=following → uniquement les auteurs suivis (+ soi-même)
   * - author=<username> → publications d'un profil
   * - tag=<hashtag> → publications contenant ce hashtag
   */
  async getPosts(
    options: { currentUser?: string; scope?: FeedScope; author?: string; tag?: string } = {},
  ): Promise<PostItem[]> {
    const rawItems = await this.kivaService.range<PostItem>('post:', 'post:~', 10000);
    let posts: PostItem[] = [];

    for (const item of rawItems) {
      if (!item.key.startsWith('post:')) continue;
      const post = item.data;
      if (post && post.id && post.content) {
        posts.push({
          ...post,
          likes: post.likes || [],
          likesCount: (post.likes || []).length,
          commentsCount: post.commentsCount || 0,
          hashtags: post.hashtags || this.extractHashtags(post.content),
        });
      }
    }

    if (options.author) {
      const author = options.author.toLowerCase();
      posts = posts.filter((p) => p.author === author);
    }

    if (options.tag) {
      const tag = options.tag.toLowerCase().replace(/^#/, '');
      posts = posts.filter((p) => (p.hashtags || []).includes(tag));
    }

    if (options.scope === 'following' && options.currentUser) {
      const me = await this.kivaService.get<UserDocument>(`user:${options.currentUser}`);
      const allowed = new Set([options.currentUser, ...(me?.following || [])]);
      posts = posts.filter((p) => allowed.has(p.author));
    }

    // Newest posts first
    return posts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Hashtags les plus utilisés sur les 7 derniers jours
   */
  async getTrendingHashtags(limit = 8): Promise<Array<{ tag: string; count: number }>> {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const posts = await this.getPosts();
    const counts = new Map<string, number>();
    for (const post of posts) {
      if (post.timestamp < since) continue;
      for (const tag of post.hashtags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return Array.from(counts, ([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private async getPostOrThrow(postId: string): Promise<PostItem> {
    const post = await this.kivaService.get<PostItem>(`post:${postId}`);
    if (!post) throw new NotFoundException('Publication introuvable dans KivaDB.');
    return post;
  }

  /**
   * Like / Unlike a post
   */
  async toggleLike(postId: string, username: string): Promise<PostItem> {
    const cleanUser = username.trim().toLowerCase();
    const key = `post:${postId}`;
    const post = await this.getPostOrThrow(postId);

    const likes = new Set(post.likes || []);
    const liked = !likes.has(cleanUser);
    if (liked) likes.add(cleanUser);
    else likes.delete(cleanUser);

    post.likes = Array.from(likes);
    post.likesCount = post.likes.length;

    await this.kivaService.set(key, post);

    if (liked) {
      this.notificationsService
        .createNotification({
          toUser: post.author,
          fromUser: cleanUser,
          type: 'like',
          title: `@${cleanUser} aime votre publication`,
          message: post.content.length > 60 ? `${post.content.substring(0, 60)}…` : post.content,
          link: `/feed#post-${post.id}`,
        })
        .catch(() => undefined);
    }
    return post;
  }

  /**
   * Edit own post
   */
  async updatePost(postId: string, username: string, content: string): Promise<PostItem> {
    const post = await this.getPostOrThrow(postId);
    if (post.author !== username) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres publications.');
    }
    const cleanContent = (content || '').trim();
    if (!cleanContent) throw new BadRequestException('Le contenu ne peut pas être vide.');
    if (cleanContent.length > MAX_POST) {
      throw new BadRequestException(`Publication trop longue (${MAX_POST} caractères maximum).`);
    }
    post.content = cleanContent;
    post.hashtags = this.extractHashtags(cleanContent);
    post.editedAt = Date.now();
    await this.kivaService.set(`post:${postId}`, post);
    return post;
  }

  /**
   * Delete own post (and its comments)
   */
  async deletePost(postId: string, username: string): Promise<boolean> {
    const cleanUser = username.trim().toLowerCase();
    const post = await this.getPostOrThrow(postId);

    if (post.author !== cleanUser) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres publications.');
    }

    const comments = await this.kivaService.scan(`comment:${postId}:*`, 10000);
    await Promise.all(comments.map((c) => this.kivaService.delete(c.key)));
    await this.kivaService.delete(`post:${postId}`);
    this.logger.log(`Post [post:${postId}] deleted by ${cleanUser} (+${comments.length} comments)`);
    return true;
  }

  // ==========================================
  // COMMENTS
  // ==========================================

  async getComments(postId: string): Promise<CommentItem[]> {
    const raw = await this.kivaService.range<CommentItem>(`comment:${postId}:`, `comment:${postId}:~`, 5000);
    return raw
      .map((i) => i.data)
      .filter((c) => c && c.id)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async addComment(
    postId: string,
    username: string,
    content: string,
  ): Promise<{ comment: CommentItem; post: PostItem }> {
    const cleanContent = (content || '').trim();
    if (!cleanContent) throw new BadRequestException('Le commentaire ne peut pas être vide.');
    if (cleanContent.length > MAX_COMMENT) {
      throw new BadRequestException(`Commentaire trop long (${MAX_COMMENT} caractères maximum).`);
    }

    const post = await this.getPostOrThrow(postId);
    const { displayName, avatar } = await this.authorInfo(username);
    const timestamp = Date.now();
    const comment: CommentItem = {
      id: `${timestamp}_${Math.random().toString(36).substring(2, 8)}`,
      postId,
      author: username,
      displayName,
      avatar,
      content: cleanContent,
      timestamp,
    };

    await this.kivaService.set(`comment:${postId}:${comment.id}`, comment);
    post.commentsCount = (post.commentsCount || 0) + 1;
    await this.kivaService.set(`post:${postId}`, post);

    this.notificationsService
      .createNotification({
        toUser: post.author,
        fromUser: username,
        type: 'comment',
        title: `@${username} a commenté votre publication`,
        message: cleanContent.length > 70 ? `${cleanContent.substring(0, 70)}…` : cleanContent,
        link: `/feed#post-${postId}`,
      })
      .catch(() => undefined);

    return { comment, post };
  }

  async deleteComment(postId: string, commentId: string, username: string): Promise<PostItem> {
    const key = `comment:${postId}:${commentId}`;
    const comment = await this.kivaService.get<CommentItem>(key);
    if (!comment) throw new NotFoundException('Commentaire introuvable.');
    const post = await this.getPostOrThrow(postId);
    // L'auteur du commentaire OU l'auteur du post peut le supprimer (modération)
    if (comment.author !== username && post.author !== username) {
      throw new ForbiddenException("Vous n'avez pas le droit de supprimer ce commentaire.");
    }
    await this.kivaService.delete(key);
    post.commentsCount = Math.max(0, (post.commentsCount || 1) - 1);
    await this.kivaService.set(`post:${postId}`, post);
    return post;
  }
}
