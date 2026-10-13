import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';

export interface ChannelDocument {
  id: string;
  name: string;
  description: string;
  creator: string;
  admins: string[];
  isPrivate: boolean;
  members: string[];
  createdAt: number;
}

@Injectable()
export class ChannelsService implements OnModuleInit {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(private readonly kivaService: KivaService) {}

  async onModuleInit() {
    await this.ensureDefaultChannels();
  }

  /**
   * Ensure default public channels exist in KivaDB
   */
  async ensureDefaultChannels(): Promise<void> {
    const general = await this.kivaService.get<ChannelDocument>('channel:general');
    if (!general) {
      const defaultGeneral: ChannelDocument = {
        id: 'general',
        name: 'Salon Général',
        description: 'Discussion publique ouverte à tous les membres de la communauté.',
        creator: 'system',
        admins: ['system', 'alice', 'bob'],
        isPrivate: false,
        members: [],
        createdAt: 1700000000000,
      };
      await this.kivaService.set('channel:general', defaultGeneral);
      this.logger.log('Default general channel initialized in KivaDB');
    }
  }

  /**
   * Get all channels visible to currentUser
   */
  async getChannels(currentUser?: string): Promise<ChannelDocument[]> {
    const rawItems = await this.kivaService.range<ChannelDocument>('channel:', 'channel:~', 1000);
    const channels: ChannelDocument[] = [];
    const cleanUser = currentUser?.trim().toLowerCase();

    for (const item of rawItems) {
      if (!item.key.startsWith('channel:')) continue;
      const ch = item.data;
      if (!ch || !ch.id) continue;

      const admins = Array.isArray(ch.admins) ? ch.admins.map((a) => a.toLowerCase()) : [];
      const members = Array.isArray(ch.members) ? ch.members.map((m) => m.toLowerCase()) : [];

      // If public, visible to all
      if (!ch.isPrivate) {
        channels.push(ch);
      } else if (cleanUser) {
        // If private, visible only to admins and members
        if (admins.includes(cleanUser) || members.includes(cleanUser) || ch.creator.toLowerCase() === cleanUser) {
          channels.push(ch);
        }
      }
    }

    return channels.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Create a new salon / channel in KivaDB
   */
  async createChannel(
    creator: string,
    data: { name: string; description?: string; isPrivate?: boolean }
  ): Promise<ChannelDocument> {
    const cleanCreator = creator.trim().toLowerCase();
    const cleanName = data.name ? data.name.trim() : '';

    if (!cleanName) {
      throw new BadRequestException('Le nom du salon est obligatoire.');
    }

    const timestamp = Date.now();
    const slug = cleanName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 20);

    const id = slug ? `${slug}-${Math.random().toString(36).substring(2, 6)}` : `c-${timestamp}`;
    const key = `channel:${id}`;

    const newChannel: ChannelDocument = {
      id,
      name: cleanName,
      description: data.description ? data.description.trim() : '',
      creator: cleanCreator,
      admins: [cleanCreator], // Creator is always the first admin
      isPrivate: !!data.isPrivate,
      members: [cleanCreator],
      createdAt: timestamp,
    };

    const saved = await this.kivaService.set(key, newChannel);
    if (!saved) {
      throw new BadRequestException("Impossible d'enregistrer le salon dans KivaDB.");
    }

    this.logger.log(`Channel [${key}] created by ${cleanCreator} (private: ${newChannel.isPrivate})`);
    return newChannel;
  }

  /**
   * Update salon visibility or details. ONLY admins can modify!
   */
  async updateChannel(
    id: string,
    currentUser: string,
    data: { name?: string; description?: string; isPrivate?: boolean; members?: string[] }
  ): Promise<ChannelDocument> {
    const key = `channel:${id}`;
    const channel = await this.kivaService.get<ChannelDocument>(key);

    if (!channel) {
      throw new NotFoundException(`Salon '${id}' introuvable dans KivaDB.`);
    }

    const cleanUser = currentUser.trim().toLowerCase();
    const admins = (channel.admins || []).map((a) => a.toLowerCase());

    if (!admins.includes(cleanUser) && channel.creator.toLowerCase() !== cleanUser) {
      throw new ForbiddenException('Seuls les administrateurs du salon peuvent modifier ses paramètres ou sa visibilité.');
    }

    if (data.name !== undefined && data.name.trim()) {
      channel.name = data.name.trim();
    }
    if (data.description !== undefined) {
      channel.description = data.description.trim();
    }
    if (data.isPrivate !== undefined) {
      channel.isPrivate = !!data.isPrivate;
    }
    if (data.members !== undefined && Array.isArray(data.members)) {
      channel.members = Array.from(new Set(data.members.map((m) => m.toLowerCase())));
    }

    await this.kivaService.set(key, channel);
    this.logger.log(`Channel [${key}] updated by admin ${cleanUser}`);
    return channel;
  }

  /**
   * Delete salon. ONLY admins can delete! Cannot delete 'general'.
   */
  async deleteChannel(id: string, currentUser: string): Promise<boolean> {
    if (id === 'general') {
      throw new BadRequestException('Le salon général ne peut pas être supprimé.');
    }

    const key = `channel:${id}`;
    const channel = await this.kivaService.get<ChannelDocument>(key);

    if (!channel) {
      throw new NotFoundException(`Salon '${id}' introuvable.`);
    }

    const cleanUser = currentUser.trim().toLowerCase();
    const admins = (channel.admins || []).map((a) => a.toLowerCase());

    if (!admins.includes(cleanUser) && channel.creator.toLowerCase() !== cleanUser) {
      throw new ForbiddenException('Seuls les administrateurs du salon ont le droit de le supprimer.');
    }

    await this.kivaService.delete(key);
    this.logger.log(`Channel [${key}] deleted by admin ${cleanUser}`);
    return true;
  }
}
