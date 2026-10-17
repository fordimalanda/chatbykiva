import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { UserDocument, SafeUser } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';

export class UpdateProfileDto {
  displayName?: string;
  bio?: string;
  avatar?: string;
}

export interface SuggestionItem extends UserSummaryItem {
  mutualCount: number;
  mutuals: string[];
}

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

  constructor(
    private readonly kivaService: KivaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Modifier son propre profil (nom affiché, bio, avatar)
   */
  async updateProfile(username: string, dto: UpdateProfileDto): Promise<SafeUser> {
    const doc = await this.kivaService.get<UserDocument>(`user:${username}`);
    if (!doc) throw new NotFoundException('Compte introuvable.');

    if (dto.displayName !== undefined) {
      const name = dto.displayName.trim();
      if (name.length < 1 || name.length > 50) {
        throw new BadRequestException('Le nom affiché doit faire entre 1 et 50 caractères.');
      }
      doc.displayName = name;
    }
    if (dto.bio !== undefined) {
      const bio = dto.bio.trim();
      if (bio.length > 280) throw new BadRequestException('La bio est limitée à 280 caractères.');
      doc.bio = bio;
    }
    if (dto.avatar !== undefined) {
      const avatar = dto.avatar.trim();
      const isValid = avatar === '' || avatar.startsWith('https://') || avatar.startsWith('/uploads/');
      if (!isValid || avatar.length > 500) {
        throw new BadRequestException("L'avatar doit être une URL https:// ou une image importée.");
      }
      doc.avatar = avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;
    }

    await this.kivaService.set(`user:${username}`, doc);
    this.logger.log(`Profile updated: user:${username}`);
    return {
      username: doc.username,
      displayName: doc.displayName,
      bio: doc.bio,
      avatar: doc.avatar,
      followers: doc.followers || [],
      following: doc.following || [],
      followersCount: (doc.followers || []).length,
      followingCount: (doc.following || []).length,
      createdAt: doc.createdAt,
    };
  }

  /**
   * Suggestions "amis d'amis" : personnes suivies par mes abonnements,
   * que je ne suis pas encore, classées par nombre de relations communes.
   * À défaut, on complète avec les comptes les plus suivis.
   */
  async getSuggestions(currentUser: string, limit = 6): Promise<SuggestionItem[]> {
    const me = currentUser.toLowerCase();
    const all = await this.findAll(me);
    const byName = new Map(all.map((u) => [u.username, u]));
    const meDoc = await this.kivaService.get<UserDocument>(`user:${me}`);
    const myFollowing = new Set(meDoc?.following || []);

    const mutuals = new Map<string, Set<string>>();
    for (const friend of myFollowing) {
      const friendDoc = await this.kivaService.get<UserDocument>(`user:${friend}`);
      for (const candidate of friendDoc?.following || []) {
        if (candidate === me || myFollowing.has(candidate) || !byName.has(candidate)) continue;
        if (!mutuals.has(candidate)) mutuals.set(candidate, new Set());
        mutuals.get(candidate)!.add(friend);
      }
    }

    const ranked: SuggestionItem[] = Array.from(mutuals, ([username, via]) => ({
      ...byName.get(username)!,
      mutualCount: via.size,
      mutuals: Array.from(via).slice(0, 3),
    })).sort((a, b) => b.mutualCount - a.mutualCount || b.followersCount - a.followersCount);

    if (ranked.length < limit) {
      const taken = new Set(ranked.map((r) => r.username));
      const popular = all
        .filter((u) => u.username !== me && !myFollowing.has(u.username) && !taken.has(u.username))
        .sort((a, b) => b.followersCount - a.followersCount)
        .map((u) => ({ ...u, mutualCount: 0, mutuals: [] }));
      ranked.push(...popular);
    }

    return ranked.slice(0, limit);
  }

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

    if (isNowFollowing) {
      const followsBack = (currentDoc.followers || []).includes(target);
      this.notificationsService
        .createNotification({
          toUser: target,
          fromUser: current,
          type: 'follow',
          title: followsBack ? `@${current} vous suit en retour` : `@${current} vous suit`,
          message: followsBack
            ? 'Vous êtes maintenant amis mutuels 🎉'
            : 'Suivez-le en retour pour devenir amis mutuels.',
          link: `/profile/${current}`,
        })
        .catch(() => undefined);
    }

    return {
      following: isNowFollowing,
      followersCount: targetDoc.followers.length,
      followingCount: targetDoc.following.length,
    };
  }
}
