import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { RegisterDto, LoginDto } from './auth.dto';
import * as bcrypt from 'bcryptjs';

export interface SafeUser {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  followersCount: number;
  followingCount: number;
  followers: string[];
  following: string[];
  createdAt: number;
}

export interface UserDocument {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  passwordHash: string;
  followers: string[];
  following: string[];
  createdAt: number;
}

@Injectable()
export class AuthService {
  constructor(private readonly kivaService: KivaService) {}

  async register(dto: RegisterDto): Promise<{ token: string; user: SafeUser }> {
    const rawUsername = dto.username?.trim();
    if (!rawUsername || rawUsername.length < 3) {
      throw new BadRequestException("Le nom d'utilisateur doit comporter au moins 3 caractères.");
    }
    if (!dto.password || dto.password.length < 4) {
      throw new BadRequestException("Le mot de passe doit comporter au moins 4 caractères.");
    }

    const username = rawUsername.toLowerCase();
    const existing = await this.kivaService.get<UserDocument>(`user:${username}`);
    if (existing) {
      throw new BadRequestException("Ce nom d'utilisateur existe déjà.");
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(dto.password, salt);

    const userDoc: UserDocument = {
      username,
      displayName: dto.displayName?.trim() || rawUsername,
      bio: dto.bio?.trim() || `Membre de la communauté Kiva Social !`,
      avatar: dto.avatar?.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
      passwordHash,
      followers: [],
      following: [],
      createdAt: Date.now(),
    };

    const saved = await this.kivaService.set(`user:${username}`, userDoc);
    if (!saved) {
      throw new BadRequestException("Impossible d'enregistrer l'utilisateur dans KivaDB.");
    }

    const token = this.generateToken(username);
    return {
      token,
      user: this.toSafeUser(userDoc),
    };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: SafeUser }> {
    const rawUsername = dto.username?.trim();
    if (!rawUsername || !dto.password) {
      throw new UnauthorizedException("Identifiant ou mot de passe incorrect");
    }

    const username = rawUsername.toLowerCase();
    const userDoc = await this.kivaService.get<UserDocument>(`user:${username}`);
    if (!userDoc || !userDoc.passwordHash) {
      throw new UnauthorizedException("Identifiant ou mot de passe incorrect");
    }

    const isMatch = bcrypt.compareSync(dto.password, userDoc.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException("Identifiant ou mot de passe incorrect");
    }

    const token = this.generateToken(username);
    return {
      token,
      user: this.toSafeUser(userDoc),
    };
  }

  generateToken(username: string): string {
    return Buffer.from(JSON.stringify({ username, ts: Date.now() })).toString('base64');
  }

  validateToken(token: string): string | null {
    try {
      if (!token) return null;
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      return decoded.username || null;
    } catch {
      return null;
    }
  }

  toSafeUser(doc: UserDocument): SafeUser {
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
}
