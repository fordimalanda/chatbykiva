import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { UserDocument } from '../auth/auth.service';

export interface PostItem {
  id: string;
  author: string;
  displayName: string;
  avatar: string;
  content: string;
  likes: string[];
  likesCount: number;
  timestamp: number;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(private readonly kivaService: KivaService) {}

  /**
   * Create a post in KivaDB stored under post:<id>
   */
  async createPost(username: string, content: string): Promise<PostItem> {
    const cleanUser = username.trim().toLowerCase();
    const cleanContent = content ? content.trim() : '';

    if (!cleanContent) {
      throw new BadRequestException('Le contenu de la publication ne peut pas être vide.');
    }

    // Retrieve user details from KivaDB
    const userDoc = await this.kivaService.get<UserDocument>(`user:${cleanUser}`);
    const displayName = userDoc?.displayName || cleanUser;
    const avatar = userDoc?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUser}`;

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
   * Get all posts from KivaDB (post:*)
   */
  async getPosts(): Promise<PostItem[]> {
    const rawItems = await this.kivaService.range<PostItem>('post:', 'post:~', 1000);
    const posts: PostItem[] = [];

    for (const item of rawItems) {
      if (!item.key.startsWith('post:')) continue;
      const post = item.data;
      if (post && post.id && post.content) {
        posts.push({
          ...post,
          likes: post.likes || [],
          likesCount: (post.likes || []).length,
        });
      }
    }

    // Newest posts first
    return posts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Like / Unlike a post
   */
  async toggleLike(postId: string, username: string): Promise<PostItem> {
    const cleanUser = username.trim().toLowerCase();
    const key = `post:${postId}`;
    const post = await this.kivaService.get<PostItem>(key);

    if (!post) {
      throw new BadRequestException('Publication introuvable dans KivaDB.');
    }

    const likes = new Set(post.likes || []);
    if (likes.has(cleanUser)) {
      likes.delete(cleanUser);
    } else {
      likes.add(cleanUser);
    }

    post.likes = Array.from(likes);
    post.likesCount = post.likes.length;

    await this.kivaService.set(key, post);
    this.logger.log(`Post [${key}] liked/unliked by ${cleanUser}, count: ${post.likesCount}`);
    return post;
  }

  /**
   * Delete own post
   */
  async deletePost(postId: string, username: string): Promise<boolean> {
    const cleanUser = username.trim().toLowerCase();
    const key = `post:${postId}`;
    const post = await this.kivaService.get<PostItem>(key);

    if (!post) {
      throw new BadRequestException('Publication introuvable.');
    }

    if (post.author !== cleanUser) {
      throw new BadRequestException('Vous ne pouvez supprimer que vos propres publications.');
    }

    await this.kivaService.delete(key);
    this.logger.log(`Post [${key}] deleted by ${cleanUser}`);
    return true;
  }
}
