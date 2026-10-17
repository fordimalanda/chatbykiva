import { Controller, Get, Post, Body, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, ChangePasswordDto } from './auth.dto';
import { CurrentUser } from './session.guard';
import { RateLimiter } from '../common/rate-limiter';

@Controller('auth')
export class AuthController {
  /** Anti brute-force : 10 tentatives / minute par identifiant */
  private readonly loginLimiter = new RateLimiter(10, 60_000);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    this.loginLimiter.hit(`register:${(dto.username || '').toLowerCase()}`);
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    this.loginLimiter.hit(`login:${(dto.username || '').toLowerCase()}`);
    return this.authService.login(dto);
  }

  @Get('me')
  async me(@CurrentUser({ required: true }) current: string) {
    return this.authService.me(current);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser({ required: true }) current: string,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.authService.changePassword(
      current,
      AuthService.extractBearer(authHeader),
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authHeader?: string) {
    return this.authService.logout(AuthService.extractBearer(authHeader) || '');
  }
}
