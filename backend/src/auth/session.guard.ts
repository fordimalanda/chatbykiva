import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Global guard: resolves the session token (Authorization: Bearer <token>)
 * against KivaDB `session:<token>` and attaches the username to the request.
 * It never blocks by itself — routes decide with @CurrentUser({ required: true }).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = AuthService.extractBearer(header);
    req.username = token ? await this.authService.validateSession(token) : null;
    req.sessionToken = token;
    return true;
  }
}

/**
 * Injects the authenticated username.
 * @CurrentUser() → string | undefined
 * @CurrentUser({ required: true }) → string (401 when missing / expired)
 */
export const CurrentUser = createParamDecorator(
  (options: { required?: boolean } | undefined, context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    const username: string | null = req.username || null;
    if (!username && options?.required) {
      throw new UnauthorizedException('Session invalide ou expirée. Veuillez vous reconnecter.');
    }
    return username || undefined;
  },
);
