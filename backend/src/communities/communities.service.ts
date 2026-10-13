import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';

export interface CommunityDocument {
  id: string;
  name: string;
  description: string;
  creator: string; // Super-admin
  admins: string[]; // List of admins
  members: string[]; // List of member usernames
  isPrivate: boolean; // false = visible/public, true = hidden/private
  pendingInvites: string[]; // Usernames who were invited
  joinRequests: string[]; // Usernames who requested to join
  createdAt: number;
}

export type SalonVisibility = 'public' | 'visible_private' | 'hidden_private';

export interface SalonDocument {
  id: string;
  communityId: string;
  name: string;
  description: string;
  creator: string;
  visibility: SalonVisibility;
  members: string[]; // Member usernames with access
  joinRequests: string[]; // Pending join requests for visible_private
  createdAt: number;
}

import { NotificationsService } from '../notifications/notifications.service';
import { Inject, forwardRef } from '@nestjs/common';

@Injectable()
export class CommunitiesService implements OnModuleInit {
  private readonly logger = new Logger(CommunitiesService.name);

  constructor(
    private readonly kivaService: KivaService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultCommunityAndSalons();
  }

  /**
   * Ensure default community and default salon exist in KivaDB
   */
  async ensureDefaultCommunityAndSalons(): Promise<void> {
    const defaultCommId = 'comm-general';
    let defaultComm = await this.kivaService.get<CommunityDocument>(`community:${defaultCommId}`);

    if (!defaultComm) {
      defaultComm = {
        id: defaultCommId,
        name: 'Communauté Générale',
        description: 'La communauté officielle pour tous les membres de KivaSocial.',
        creator: 'system',
        admins: ['system', 'alice', 'bob'],
        members: ['system', 'alice', 'bob'],
        isPrivate: false,
        pendingInvites: [],
        joinRequests: [],
        createdAt: 1700000000000,
      };
      await this.kivaService.set(`community:${defaultCommId}`, defaultComm);
      this.logger.log('Default community initialized in KivaDB');
    }

    const defaultSalonId = 'general';
    let defaultSalon = await this.kivaService.get<SalonDocument>(`salon:${defaultSalonId}`);
    if (!defaultSalon) {
      defaultSalon = {
        id: defaultSalonId,
        communityId: defaultCommId,
        name: 'Général',
        description: 'Discussion publique ouverte à tous les membres.',
        creator: 'system',
        visibility: 'public',
        members: ['system', 'alice', 'bob'],
        joinRequests: [],
        createdAt: 1700000000000,
      };
      await this.kivaService.set(`salon:${defaultSalonId}`, defaultSalon);
      this.logger.log('Default general salon initialized in KivaDB');
    }
  }

  // ==========================================
  // COMMUNITIES
  // ==========================================

  /**
   * Get all communities visible to currentUser
   */
  async getCommunities(currentUser?: string): Promise<CommunityDocument[]> {
    const rawItems = await this.kivaService.range<CommunityDocument>('community:', 'community:~', 1000);
    const communities: CommunityDocument[] = [];
    const cleanUser = currentUser?.trim().toLowerCase();

    for (const item of rawItems) {
      if (!item.key.startsWith('community:')) continue;
      const comm = item.data;
      if (!comm || !comm.id) continue;

      const members = (comm.members || []).map((m) => m.toLowerCase());
      const admins = (comm.admins || []).map((a) => a.toLowerCase());
      const pendingInvites = (comm.pendingInvites || []).map((i) => i.toLowerCase());

      // If public/visible, anyone can see it
      if (!comm.isPrivate) {
        communities.push(comm);
      } else if (cleanUser) {
        // If hidden/private, only members, admins, creator, or invited users see it
        if (
          members.includes(cleanUser) ||
          admins.includes(cleanUser) ||
          comm.creator.toLowerCase() === cleanUser ||
          pendingInvites.includes(cleanUser)
        ) {
          communities.push(comm);
        }
      }
    }

    return communities.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Get community by ID
   */
  async getCommunityById(id: string): Promise<CommunityDocument> {
    const comm = await this.kivaService.get<CommunityDocument>(`community:${id}`);
    if (!comm) {
      throw new NotFoundException(`Communauté '${id}' introuvable.`);
    }
    return comm;
  }

  /**
   * Create a new community
   */
  async createCommunity(
    creator: string,
    data: { name: string; description?: string; isPrivate?: boolean }
  ): Promise<CommunityDocument> {
    const cleanCreator = creator.trim().toLowerCase();
    const cleanName = data.name ? data.name.trim() : '';

    if (!cleanName) {
      throw new BadRequestException('Le nom de la communauté est requis.');
    }

    const timestamp = Date.now();
    const slug = cleanName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 16);

    const id = slug ? `comm-${slug}-${Math.random().toString(36).substring(2, 6)}` : `comm-${timestamp}`;
    const key = `community:${id}`;

    const newCommunity: CommunityDocument = {
      id,
      name: cleanName,
      description: data.description ? data.description.trim() : '',
      creator: cleanCreator,
      admins: [cleanCreator],
      members: [cleanCreator],
      isPrivate: !!data.isPrivate,
      pendingInvites: [],
      joinRequests: [],
      createdAt: timestamp,
    };

    await this.kivaService.set(key, newCommunity);

    // Automatically create a default general salon in the new community
    const defaultSalon: SalonDocument = {
      id: `s-${Math.random().toString(36).substring(2, 8)}`,
      communityId: id,
      name: 'Général',
      description: `Salon principal de la communauté ${cleanName}`,
      creator: cleanCreator,
      visibility: 'public',
      members: [cleanCreator],
      joinRequests: [],
      createdAt: timestamp,
    };
    await this.kivaService.set(`salon:${defaultSalon.id}`, defaultSalon);

    this.logger.log(`Community [${id}] created by ${cleanCreator} with default salon`);
    return newCommunity;
  }

  /**
   * Update community details (Admin only)
   */
  async updateCommunity(
    id: string,
    currentUser: string,
    data: { name?: string; description?: string; isPrivate?: boolean }
  ): Promise<CommunityDocument> {
    const key = `community:${id}`;
    const comm = await this.kivaService.get<CommunityDocument>(key);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = currentUser.trim().toLowerCase();
    const admins = (comm.admins || []).map((a) => a.toLowerCase());

    if (!admins.includes(cleanUser) && comm.creator.toLowerCase() !== cleanUser) {
      throw new ForbiddenException('Seuls les administrateurs peuvent modifier cette communauté.');
    }

    if (data.name !== undefined && data.name.trim()) {
      comm.name = data.name.trim();
    }
    if (data.description !== undefined) {
      comm.description = data.description.trim();
    }
    if (data.isPrivate !== undefined) {
      comm.isPrivate = !!data.isPrivate;
    }

    await this.kivaService.set(key, comm);
    return comm;
  }

  /**
   * Delete community (Creator only)
   */
  async deleteCommunity(id: string, currentUser: string): Promise<boolean> {
    if (id === 'comm-general') {
      throw new BadRequestException('La communauté générale ne peut pas être supprimée.');
    }

    const key = `community:${id}`;
    const comm = await this.kivaService.get<CommunityDocument>(key);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = currentUser.trim().toLowerCase();
    if (comm.creator.toLowerCase() !== cleanUser) {
      throw new ForbiddenException('Seul le créateur peut supprimer la communauté.');
    }

    // Delete associated salons
    const salons = await this.getSalonsForCommunity(id, currentUser);
    for (const salon of salons) {
      await this.kivaService.delete(`salon:${salon.id}`);
    }

    await this.kivaService.delete(key);
    return true;
  }

  /**
   * Invite user to community (Admin/Creator only)
   */
  async inviteUserToCommunity(
    communityId: string,
    currentUser: string,
    targetUsername: string
  ): Promise<CommunityDocument> {
    const key = `community:${communityId}`;
    const comm = await this.kivaService.get<CommunityDocument>(key);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = currentUser.trim().toLowerCase();
    const cleanTarget = targetUsername.trim().toLowerCase();

    const admins = (comm.admins || []).map((a) => a.toLowerCase());
    if (!admins.includes(cleanUser) && comm.creator.toLowerCase() !== cleanUser) {
      throw new ForbiddenException('Seuls les administrateurs peuvent inviter des utilisateurs.');
    }

    if (comm.members.map((m) => m.toLowerCase()).includes(cleanTarget)) {
      throw new BadRequestException('Cet utilisateur fait déjà partie de la communauté.');
    }

    if (!comm.pendingInvites) comm.pendingInvites = [];
    if (!comm.pendingInvites.map((p) => p.toLowerCase()).includes(cleanTarget)) {
      comm.pendingInvites.push(cleanTarget);
      await this.kivaService.set(key, comm);

      this.notificationsService.createNotification({
        toUser: cleanTarget,
        fromUser: cleanUser,
        type: 'invite',
        title: 'Invitation Communautaire',
        message: `@${cleanUser} vous invite à rejoindre la communauté "${comm.name}"`,
        link: '/messages',
      }).catch(console.error);
    }

    return comm;
  }

  /**
   * Respond to community invitation (accept or decline)
   */
  async respondToInvite(
    communityId: string,
    username: string,
    accept: boolean
  ): Promise<CommunityDocument> {
    const key = `community:${communityId}`;
    const comm = await this.kivaService.get<CommunityDocument>(key);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = username.trim().toLowerCase();
    comm.pendingInvites = (comm.pendingInvites || []).filter((u) => u.toLowerCase() !== cleanUser);

    if (accept) {
      if (!comm.members) comm.members = [];
      if (!comm.members.map((m) => m.toLowerCase()).includes(cleanUser)) {
        comm.members.push(cleanUser);
      }

      // Automatically add new community member to all public salons in this community
      const salons = await this.getSalonsByCommunityRaw(communityId);
      for (const salon of salons) {
        if (salon.visibility === 'public') {
          if (!salon.members) salon.members = [];
          if (!salon.members.map((m) => m.toLowerCase()).includes(cleanUser)) {
            salon.members.push(cleanUser);
            await this.kivaService.set(`salon:${salon.id}`, salon);
          }
        }
      }
    }

    await this.kivaService.set(key, comm);
    return comm;
  }

  /**
   * Join public community or request to join
   */
  async joinCommunity(communityId: string, username: string): Promise<CommunityDocument> {
    const key = `community:${communityId}`;
    const comm = await this.kivaService.get<CommunityDocument>(key);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = username.trim().toLowerCase();
    if (comm.members.map((m) => m.toLowerCase()).includes(cleanUser)) {
      return comm;
    }

    if (!comm.isPrivate) {
      // Public community: instant join
      comm.members.push(cleanUser);
      // Auto-add to public salons
      const salons = await this.getSalonsByCommunityRaw(communityId);
      for (const s of salons) {
        if (s.visibility === 'public') {
          if (!s.members) s.members = [];
          if (!s.members.map((m) => m.toLowerCase()).includes(cleanUser)) {
            s.members.push(cleanUser);
            await this.kivaService.set(`salon:${s.id}`, s);
          }
        }
      }
    } else {
      // Hidden/Private community: add to joinRequests if not invited
      if (!comm.joinRequests) comm.joinRequests = [];
      if (!comm.joinRequests.map((r) => r.toLowerCase()).includes(cleanUser)) {
        comm.joinRequests.push(cleanUser);
      }
    }

    await this.kivaService.set(key, comm);
    return comm;
  }

  /**
   * Promote or demote user to/from Admin in community (Creator only)
   */
  async toggleAdmin(
    communityId: string,
    currentUser: string,
    targetUsername: string
  ): Promise<CommunityDocument> {
    const key = `community:${communityId}`;
    const comm = await this.kivaService.get<CommunityDocument>(key);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = currentUser.trim().toLowerCase();
    const cleanTarget = targetUsername.trim().toLowerCase();

    if (comm.creator.toLowerCase() !== cleanUser) {
      throw new ForbiddenException('Seul le créateur de la communauté peut nommer des administrateurs.');
    }

    if (!comm.admins) comm.admins = [comm.creator];

    if (comm.admins.map((a) => a.toLowerCase()).includes(cleanTarget)) {
      if (cleanTarget === comm.creator.toLowerCase()) {
        throw new BadRequestException('Le créateur reste toujours administrateur.');
      }
      comm.admins = comm.admins.filter((a) => a.toLowerCase() !== cleanTarget);
    } else {
      comm.admins.push(cleanTarget);
      if (!comm.members.map((m) => m.toLowerCase()).includes(cleanTarget)) {
        comm.members.push(cleanTarget);
      }
    }

    await this.kivaService.set(key, comm);
    return comm;
  }

  // ==========================================
  // SALONS (INSIDE COMMUNITIES)
  // ==========================================

  private async getSalonsByCommunityRaw(communityId: string): Promise<SalonDocument[]> {
    const rawItems = await this.kivaService.range<SalonDocument>('salon:', 'salon:~', 1000);
    const salons: SalonDocument[] = [];
    for (const item of rawItems) {
      if (!item.key.startsWith('salon:')) continue;
      const s = item.data;
      if (s && s.communityId === communityId) {
        salons.push(s);
      }
    }
    return salons;
  }

  /**
   * Get salons for community visible to currentUser
   */
  async getSalonsForCommunity(communityId: string, currentUser?: string): Promise<SalonDocument[]> {
    const rawSalons = await this.getSalonsByCommunityRaw(communityId);
    const comm = await this.kivaService.get<CommunityDocument>(`community:${communityId}`);
    const cleanUser = currentUser?.trim().toLowerCase();

    const isCommAdmin =
      comm &&
      cleanUser &&
      (comm.creator.toLowerCase() === cleanUser ||
        (comm.admins || []).map((a) => a.toLowerCase()).includes(cleanUser));

    const result: SalonDocument[] = [];

    for (const salon of rawSalons) {
      const members = (salon.members || []).map((m) => m.toLowerCase());
      const isMember = cleanUser ? members.includes(cleanUser) : false;

      if (salon.visibility === 'public') {
        // Visible to everyone in community
        result.push(salon);
      } else if (salon.visibility === 'visible_private') {
        // Visible in list, but private: members see it, non-members see it with "request join"
        result.push(salon);
      } else if (salon.visibility === 'hidden_private') {
        // Hidden & Private: only members or community admins see it!
        if (isMember || isCommAdmin) {
          result.push(salon);
        }
      }
    }

    return result.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Create salon in a community
   */
  async createSalon(
    communityId: string,
    currentUser: string,
    data: {
      name: string;
      description?: string;
      visibility?: SalonVisibility;
    }
  ): Promise<SalonDocument> {
    const comm = await this.kivaService.get<CommunityDocument>(`community:${communityId}`);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = currentUser.trim().toLowerCase();
    const isCommAdmin =
      comm.creator.toLowerCase() === cleanUser ||
      (comm.admins || []).map((a) => a.toLowerCase()).includes(cleanUser);

    if (!isCommAdmin) {
      throw new ForbiddenException('Seuls les administrateurs de la communauté peuvent créer un salon.');
    }

    const cleanName = data.name ? data.name.trim() : '';
    if (!cleanName) {
      throw new BadRequestException('Le nom du salon est obligatoire.');
    }

    const visibility: SalonVisibility = data.visibility || 'public';
    const timestamp = Date.now();
    const id = `s-${Math.random().toString(36).substring(2, 8)}`;

    // If salon is public, all current community members are auto-added!
    const initialMembers =
      visibility === 'public'
        ? Array.from(new Set([cleanUser, ...(comm.members || [])]))
        : [cleanUser];

    const newSalon: SalonDocument = {
      id,
      communityId,
      name: cleanName,
      description: data.description ? data.description.trim() : '',
      creator: cleanUser,
      visibility,
      members: initialMembers,
      joinRequests: [],
      createdAt: timestamp,
    };

    await this.kivaService.set(`salon:${id}`, newSalon);
    this.logger.log(`Salon [${id}] created in community [${communityId}] with visibility [${visibility}]`);
    return newSalon;
  }

  /**
   * Update salon details (Name, description, visibility)
   */
  async updateSalon(
    communityId: string,
    salonId: string,
    currentUser: string,
    data: { name?: string; description?: string; visibility?: SalonVisibility }
  ): Promise<SalonDocument> {
    const salon = await this.kivaService.get<SalonDocument>(`salon:${salonId}`);
    if (!salon || salon.communityId !== communityId) {
      throw new NotFoundException('Salon introuvable.');
    }

    const comm = await this.kivaService.get<CommunityDocument>(`community:${communityId}`);
    const cleanUser = currentUser.trim().toLowerCase();
    const isCommAdmin =
      (comm &&
        (comm.creator.toLowerCase() === cleanUser ||
          (comm.admins || []).map((a) => a.toLowerCase()).includes(cleanUser))) ||
      salon.creator.toLowerCase() === cleanUser;

    if (!isCommAdmin) {
      throw new ForbiddenException('Seuls les administrateurs peuvent modifier ce salon.');
    }

    if (data.name !== undefined && data.name.trim()) {
      salon.name = data.name.trim();
    }
    if (data.description !== undefined) {
      salon.description = data.description.trim();
    }
    if (data.visibility !== undefined) {
      salon.visibility = data.visibility;
      // If changed to public, ensure all community members are added
      if (salon.visibility === 'public' && comm) {
        salon.members = Array.from(new Set([...(salon.members || []), ...(comm.members || [])]));
      }
    }

    await this.kivaService.set(`salon:${salonId}`, salon);
    return salon;
  }

  /**
   * Delete salon (Admin only, cannot delete 'general')
   */
  async deleteSalon(communityId: string, salonId: string, currentUser: string): Promise<boolean> {
    if (salonId === 'general') {
      throw new BadRequestException('Le salon général principal ne peut pas être supprimé.');
    }

    const salon = await this.kivaService.get<SalonDocument>(`salon:${salonId}`);
    if (!salon || salon.communityId !== communityId) {
      throw new NotFoundException('Salon introuvable.');
    }

    const comm = await this.kivaService.get<CommunityDocument>(`community:${communityId}`);
    const cleanUser = currentUser.trim().toLowerCase();
    const isCommAdmin =
      (comm &&
        (comm.creator.toLowerCase() === cleanUser ||
          (comm.admins || []).map((a) => a.toLowerCase()).includes(cleanUser))) ||
      salon.creator.toLowerCase() === cleanUser;

    if (!isCommAdmin) {
      throw new ForbiddenException('Seuls les administrateurs peuvent supprimer ce salon.');
    }

    await this.kivaService.delete(`salon:${salonId}`);
    return true;
  }

  /**
   * Add a community member directly to a salon (Admin action, no invite needed because they are in the community!)
   */
  async addMemberToSalon(
    communityId: string,
    salonId: string,
    currentUser: string,
    targetUsername: string
  ): Promise<SalonDocument> {
    const salon = await this.kivaService.get<SalonDocument>(`salon:${salonId}`);
    if (!salon || salon.communityId !== communityId) {
      throw new NotFoundException('Salon introuvable.');
    }

    const comm = await this.kivaService.get<CommunityDocument>(`community:${communityId}`);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = currentUser.trim().toLowerCase();
    const cleanTarget = targetUsername.trim().toLowerCase();

    const isCommAdmin =
      comm.creator.toLowerCase() === cleanUser ||
      (comm.admins || []).map((a) => a.toLowerCase()).includes(cleanUser) ||
      salon.creator.toLowerCase() === cleanUser;

    if (!isCommAdmin) {
      throw new ForbiddenException('Seuls les administrateurs peuvent ajouter des membres au salon.');
    }

    // Must be in community first!
    if (!comm.members.map((m) => m.toLowerCase()).includes(cleanTarget)) {
      throw new BadRequestException("L'utilisateur doit d'abord être membre de la communauté avant d'être ajouté au salon.");
    }

    if (!salon.members) salon.members = [];
    if (!salon.members.map((m) => m.toLowerCase()).includes(cleanTarget)) {
      salon.members.push(cleanTarget);
    }

    // Remove from join requests if pending
    salon.joinRequests = (salon.joinRequests || []).filter((r) => r.toLowerCase() !== cleanTarget);

    await this.kivaService.set(`salon:${salonId}`, salon);
    return salon;
  }

  /**
   * Request to join visible_private salon
   */
  async requestJoinSalon(
    communityId: string,
    salonId: string,
    username: string
  ): Promise<SalonDocument> {
    const salon = await this.kivaService.get<SalonDocument>(`salon:${salonId}`);
    if (!salon || salon.communityId !== communityId) {
      throw new NotFoundException('Salon introuvable.');
    }

    const comm = await this.kivaService.get<CommunityDocument>(`community:${communityId}`);
    if (!comm) throw new NotFoundException('Communauté introuvable.');

    const cleanUser = username.trim().toLowerCase();

    // Must be in community
    if (!comm.members.map((m) => m.toLowerCase()).includes(cleanUser)) {
      throw new BadRequestException("Vous devez d'abord rejoindre la communauté.");
    }

    if ((salon.members || []).map((m) => m.toLowerCase()).includes(cleanUser)) {
      return salon;
    }

    if (!salon.joinRequests) salon.joinRequests = [];
    if (!salon.joinRequests.map((r) => r.toLowerCase()).includes(cleanUser)) {
      salon.joinRequests.push(cleanUser);
      await this.kivaService.set(`salon:${salonId}`, salon);

      // Notify community creator and admins
      const targetAdmins = Array.from(new Set([comm.creator, ...(comm.admins || [])]));
      for (const admin of targetAdmins) {
        if (admin.toLowerCase() !== cleanUser) {
          this.notificationsService.createNotification({
            toUser: admin,
            fromUser: cleanUser,
            type: 'join_request',
            title: "Demande d'accès au salon",
            message: `@${cleanUser} demande à rejoindre le salon #${salon.name}`,
            link: '/messages',
          }).catch(console.error);
        }
      }
    }

    return salon;
  }

  /**
   * Approve or decline join request to salon (Admin only)
   */
  async respondToSalonJoinRequest(
    communityId: string,
    salonId: string,
    currentUser: string,
    targetUsername: string,
    approve: boolean
  ): Promise<SalonDocument> {
    const salon = await this.kivaService.get<SalonDocument>(`salon:${salonId}`);
    if (!salon || salon.communityId !== communityId) {
      throw new NotFoundException('Salon introuvable.');
    }

    const comm = await this.kivaService.get<CommunityDocument>(`community:${communityId}`);
    const cleanUser = currentUser.trim().toLowerCase();
    const cleanTarget = targetUsername.trim().toLowerCase();

    const isCommAdmin =
      (comm &&
        (comm.creator.toLowerCase() === cleanUser ||
          (comm.admins || []).map((a) => a.toLowerCase()).includes(cleanUser))) ||
      salon.creator.toLowerCase() === cleanUser;

    if (!isCommAdmin) {
      throw new ForbiddenException('Seuls les administrateurs peuvent valider les demandes.');
    }

    salon.joinRequests = (salon.joinRequests || []).filter((r) => r.toLowerCase() !== cleanTarget);

    if (approve) {
      if (!salon.members) salon.members = [];
      if (!salon.members.map((m) => m.toLowerCase()).includes(cleanTarget)) {
        salon.members.push(cleanTarget);
      }
    }

    await this.kivaService.set(`salon:${salonId}`, salon);
    return salon;
  }
}
