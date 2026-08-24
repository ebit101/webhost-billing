import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { AUTH_TOKEN_FACTORY } from './auth.constants';
import { AuthController } from './controllers/auth.controller';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { CustomerOwnershipGuard } from './guards/customer-ownership.guard';
import { RolesGuard } from './guards/roles.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthAuditService } from './services/auth-audit.service';
import { AuthCookieService } from './services/auth-cookie.service';
import { AuthRateLimitService } from './services/auth-rate-limit.service';
import { AuthService } from './services/auth.service';
import { CryptoAuthTokenFactory } from './services/auth-token.service';
import { CsrfService } from './services/csrf.service';
import { PasswordHasherService } from './services/password-hasher.service';
import { TokenCipherService } from './services/token-cipher.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthAuditService,
    AuthCookieService,
    AuthRateLimitService,
    CsrfService,
    PasswordHasherService,
    TokenCipherService,
    {
      provide: AUTH_TOKEN_FACTORY,
      useClass: CryptoAuthTokenFactory,
    },
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CustomerOwnershipGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthRateLimitGuard,
    },
  ],
  exports: [
    AuthService,
    AuthAuditService,
    AuthCookieService,
    PasswordHasherService,
  ],
})
export class AuthModule {}
