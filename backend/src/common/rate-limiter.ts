import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Limiteur à fenêtre glissante en mémoire (par clé : utilisateur, action...).
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string): void {
    const now = Date.now();
    const recent = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      const retryIn = Math.ceil((this.windowMs - (now - recent[0])) / 1000);
      throw new HttpException(
        `Trop de requêtes. Réessayez dans ${retryIn} s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);

    // Nettoyage occasionnel pour ne pas grossir indéfiniment
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) {
        if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
      }
    }
  }
}
