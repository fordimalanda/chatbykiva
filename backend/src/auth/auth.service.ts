import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
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

/**
 * Session stockée dans KivaDB sous la clé : session:<token>
 */
export interface SessionDocument {
  token: string;
  username: string;
  createdAt: number;
  expiresAt: number; // timestamp ms, TTL 30 jours
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** TTL session : 30 jours en millisecondes */
  private readonly SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
    // Persister la session dans KivaDB sous session:<token>
    await this.saveSessionToKiva(token, username);
    this.logger.log(`Compte créé + session KivaDB enregistrée : user:${username}`);
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
    // Persister la session dans KivaDB sous session:<token>
    await this.saveSessionToKiva(token, username);
    this.logger.log(`Connexion réussie — session KivaDB : session:${token.substring(0, 12)}...`);
    return {
      token,
      user: this.toSafeUser(userDoc),
    };
  }

  /**
   * Déconnexion : supprime la session de KivaDB
   */
  async logout(token: string): Promise<{ success: boolean }> {
    if (!token) return { success: false };
    try {
      await this.kivaService.delete(`session:${token}`);
      this.logger.log(`Session supprimée de KivaDB : session:${token.substring(0, 12)}...`);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * Valider un token via la session KivaDB (en plus de la validation base64)
   */
  async validateSession(token: string): Promise<string | null> {
    if (!token) return null;
    try {
      const session = await this.kivaService.get<SessionDocument>(`session:${token}`);
      if (!session) return null;
      if (Date.now() > session.expiresAt) {
        // Session expirée → nettoyage automatique
        await this.kivaService.delete(`session:${token}`);

        return null;
      }
      return session.username;
    } catch {
      return null;
    }
  }

  /** Enregistrer une session dans KivaDB */
  private async saveSessionToKiva(token: string, username: string): Promise<void> {
    const sessionDoc: SessionDocument = {
      token,
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.SESSION_TTL_MS,
    };
    await this.kivaService.set(`session:${token}`, sessionDoc);
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
