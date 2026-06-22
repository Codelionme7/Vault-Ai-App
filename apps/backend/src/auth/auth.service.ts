import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AppConfig } from '../config/configuration';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthResult {
  user: { id: string; email: string; displayName?: string; createdAt: string };
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly crypto: CryptoService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, displayName: dto.displayName },
    });
    return this.issueTokens(user.id, user.email, user.displayName, user.createdAt);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id, user.email, user.displayName, user.createdAt);
  }

  /** Rotate a refresh token: validate, revoke the old, issue a fresh pair. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const jwtCfg = this.config.get('jwt', { infer: true });
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: jwtCfg.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.crypto.sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    return this.issueTokens(user.id, user.email, user.displayName, user.createdAt);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.crypto.sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
    displayName: string | null,
    createdAt: Date,
  ): Promise<AuthResult> {
    const jwtCfg = this.config.get('jwt', { infer: true });
    const payload: JwtPayload = { sub: userId, email };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: jwtCfg.accessSecret,
      expiresIn: jwtCfg.accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: jwtCfg.refreshSecret,
      expiresIn: jwtCfg.refreshTtl,
    });

    // Persist only a hash of the refresh token so a DB leak can't impersonate.
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.crypto.sha256(refreshToken),
        expiresAt: new Date(Date.now() + jwtCfg.refreshTtl * 1000),
      },
    });

    return {
      user: {
        id: userId,
        email,
        displayName: displayName ?? undefined,
        createdAt: createdAt.toISOString(),
      },
      accessToken,
      refreshToken,
    };
  }
}
