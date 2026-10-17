import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { KivaService } from '../kiva/kiva.service';
import { RegisterDto, LoginDto } from './auth.dto';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

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
  /** Cache mémoire des sessions validées, pour éviter un aller-retour KivaDB à chaque requête */
  private readonly sessionCache = new Map<string, { username: string; until: number }>();
  private readonly SESSION_CACHE_MS = 30 * 1000;
  static readonly USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;

  constructor(private readonly kivaService: KivaService) {}

  static extractBearer(header?: string): string | null {
    if (!header || !header.startsWith('Bearer ')) return null;
    const token = header.substring(7).trim();
    return token || null;
  }

  async register(dto: RegisterDto): Promise<{ token: string; user: SafeUser }> {
    const rawUsername = dto.username?.trim();
    if (!rawUsername || !AuthService.USERNAME_PATTERN.test(rawUsername.toLowerCase())) {
      throw new BadRequestException(
        "Le nom d'utilisateur doit faire 3 à 24 caractères (lettres, chiffres, - ou _).",
      );
    }
    if (!dto.password || dto.password.length < 6) {
      throw new BadRequestException('Le mot de passe doit comporter au moins 6 caractères.');
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
      displayName: (dto.displayName?.trim() || rawUsername).substring(0, 50),
      bio: (dto.bio?.trim() || `Membre de la communauté Kiva Social !`).substring(0, 280),
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

    const token = this.generateToken();
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
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }

    const username = rawUsername.toLowerCase();
    const userDoc = await this.kivaService.get<UserDocument>(`user:${username}`);
    if (!userDoc || !userDoc.passwordHash) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }

    const isMatch = bcrypt.compareSync(dto.password, userDoc.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }

    const token = this.generateToken();
    await this.saveSessionToKiva(token, username);
    this.logger.log(`Connexion réussie — session KivaDB : session:${token.substring(0, 8)}...`);
    return {
      token,
      user: this.toSafeUser(userDoc),
    };
  }

  /**
   * Profil courant à partir de la session (utilisé par le frontend pour vérifier le token au démarrage)
   */
  async me(username: string): Promise<SafeUser> {
    const userDoc = await this.kivaService.get<UserDocument>(`user:${username}`);
    if (!userDoc) throw new UnauthorizedException('Compte introuvable.');
    return this.toSafeUser(userDoc);
  }

  /**
   * Déconnexion : supprime la session de KivaDB
   */
  async logout(token: string): Promise<{ success: boolean }> {
    if (!token) return { success: false };
    this.sessionCache.delete(token);
    try {
      await this.kivaService.delete(`session:${token}`);
      this.logger.log(`Session supprimée de KivaDB : session:${token.substring(0, 8)}...`);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * Valider un token via la session KivaDB (avec un petit cache mémoire)
   */
  async validateSession(token: string): Promise<string | null> {
    if (!token) return null;
    const cached = this.sessionCache.get(token);
    if (cached && cached.until > Date.now()) return cached.username;
    try {
      const session = await this.kivaService.get<SessionDocument>(`session:${token}`);
      if (!session) {
        this.sessionCache.delete(token);
        return null;
      }
      if (Date.now() > session.expiresAt) {
        // Session expirée → nettoyage automatique
        await this.kivaService.delete(`session:${token}`);
        this.sessionCache.delete(token);
        return null;
      }
      this.sessionCache.set(token, { username: session.username, until: Date.now() + this.SESSION_CACHE_MS });
      return session.username;
    } catch {
      return null;
    }
  }

  /**
   * Changer le mot de passe : vérifie l'ancien, puis révoque toutes les autres sessions
   */
  async changePassword(
    username: string,
    currentToken: string | null,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; revokedSessions: number }> {
    const userDoc = await this.kivaService.get<UserDocument>(`user:${username}`);
    if (!userDoc) throw new UnauthorizedException('Compte introuvable.');
    if (!currentPassword || !bcrypt.compareSync(currentPassword, userDoc.passwordHash)) {
      throw new BadRequestException('Mot de passe actuel incorrect.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Le nouveau mot de passe doit comporter au moins 6 caractères.');
    }

    userDoc.passwordHash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
    await this.kivaService.set(`user:${username}`, userDoc);

    const sessions = await this.kivaService.range<SessionDocument>('session:', 'session:~', 10000);
    let revoked = 0;
    for (const item of sessions) {
      if (item.data?.username === username && item.data.token !== currentToken) {
        await this.kivaService.delete(item.key);
        this.sessionCache.delete(item.data.token);
        revoked++;
      }
    }
    this.logger.log(`Mot de passe modifié pour ${username} (${revoked} session(s) révoquée(s))`);
    return { success: true, revokedSessions: revoked };
  }

  /** Enregistrer une session dans KivaDB (TTL natif KivaDB en secondes) */
  private async saveSessionToKiva(token: string, username: string): Promise<void> {
    const sessionDoc: SessionDocument = {
      token,
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.SESSION_TTL_MS,
    };
    await this.kivaService.set(`session:${token}`, sessionDoc, Math.floor(this.SESSION_TTL_MS / 1000));
  }

  /** Jeton opaque cryptographiquement aléatoire (ne contient aucune donnée devinable) */
  generateToken(): string {
    return randomBytes(32).toString('hex');
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
