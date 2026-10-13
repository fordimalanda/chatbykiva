import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { UserDocument, SafeUser } from '../auth/auth.service';

export interface UserSummaryItem {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  followsYou: boolean;
  createdAt: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly kivaService: KivaService) {}

  /**
   * Get all registered users from KivaDB via scan/range
   */
  async findAll(currentUser?: string): Promise<UserSummaryItem[]> {
    const rangeData = await this.kivaService.range<UserDocument>('user:', 'user:~');
    const users: UserSummaryItem[] = [];

    const cUser = currentUser?.toLowerCase();

    for (const item of rangeData) {
      if (!item.key.startsWith('user:')) continue;
      const doc = item.data;
      if (!doc || !doc.username) continue;

      const followers = Array.isArray(doc.followers) ? doc.followers : [];
      const following = Array.isArray(doc.following) ? doc.following : [];

      users.push({
        username: doc.username,
        displayName: doc.displayName || doc.username,
        bio: doc.bio || '',
        avatar: doc.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${doc.username}`,
        followersCount: followers.length,
        followingCount: following.length,
        isFollowing: cUser ? followers.includes(cUser) : false,
        followsYou: cUser ? following.includes(cUser) : false,
        createdAt: doc.createdAt || Date.now(),
      });
    }

    return users.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get single user profile
   */
  async findByUsername(username: string, currentUser?: string): Promise<SafeUser & { isFollowing: boolean; followsYou: boolean }> {
    const cleanUsername = username.toLowerCase();
    const doc = await this.kivaService.get<UserDocument>(`user:${cleanUsername}`);
    if (!doc) {
      throw new NotFoundException(`Utilisateur '${cleanUsername}' introuvable.`);
    }

    const followers = Array.isArray(doc.followers) ? doc.followers : [];
    const following = Array.isArray(doc.following) ? doc.following : [];
    const cUser = currentUser?.toLowerCase();

    return {
      username: doc.username,
      displayName: doc.displayName || doc.username,
      bio: doc.bio || '',
      avatar: doc.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${doc.username}`,
      followers,
      following,
      followersCount: followers.length,
      followingCount: following.length,
      createdAt: doc.createdAt || Date.now(),
      isFollowing: cUser ? followers.includes(cUser) : false,
      followsYou: cUser ? following.includes(cUser) : false,
    };
  }

  /**
   * Follow or unfollow a user in KivaDB
   */
  async toggleFollow(targetUsername: string, currentUsername: string): Promise<{ following: boolean; followersCount: number; followingCount: number }> {
    const target = targetUsername.toLowerCase();
    const current = currentUsername.toLowerCase();

    if (target === current) {
      throw new BadRequestException('Vous ne pouvez pas vous suivre vous-même.');
    }

    const targetDoc = await this.kivaService.get<UserDocument>(`user:${target}`);
    if (!targetDoc) {
      throw new NotFoundException(`Utilisateur cible '${target}' introuvable.`);
    }

    const currentDoc = await this.kivaService.get<UserDocument>(`user:${current}`);
    if (!currentDoc) {
      throw new NotFoundException(`Votre compte '${current}' est introuvable.`);
    }

    const targetFollowers = new Set(Array.isArray(targetDoc.followers) ? targetDoc.followers : []);
    const currentFollowing = new Set(Array.isArray(currentDoc.following) ? currentDoc.following : []);

    let isNowFollowing = false;

    if (targetFollowers.has(current)) {
      // Unfollow
      targetFollowers.delete(current);
      currentFollowing.delete(target);
      isNowFollowing = false;
    } else {
      // Follow
      targetFollowers.add(current);
      currentFollowing.add(target);
      isNowFollowing = true;
    }

    targetDoc.followers = Array.from(targetFollowers);
    currentDoc.following = Array.from(currentFollowing);

    // Save both documents back into KivaDB
    await Promise.all([
      this.kivaService.set(`user:${target}`, targetDoc),
      this.kivaService.set(`user:${current}`, currentDoc),
    ]);

    this.logger.log(`Follow relation updated: ${current} -> ${target} (isFollowing: ${isNowFollowing})`);

    return {
      following: isNowFollowing,
      followersCount: targetDoc.followers.length,
      followingCount: targetDoc.following.length,
    };
  }
}
