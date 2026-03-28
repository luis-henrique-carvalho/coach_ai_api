import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService, OAuthProfile } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';

interface TokenPayload {
  sub: string;
  type: string;
}

@Injectable()
export class AuthService {
  private revokedTokens: Set<string> = new Set();

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  generateTokens(userId: string): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessToken = this.jwtService.sign(
      { sub: userId, type: 'access' },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      { expiresIn: '7d' },
    );

    return { accessToken, refreshToken };
  }

  validateRefreshToken(token: string): string | null {
    try {
      // Check if token is revoked
      if (this.revokedTokens.has(token)) {
        return null;
      }

      const payload = this.jwtService.verify<TokenPayload>(token);

      // Verify it's a refresh token
      if (payload.type !== 'refresh') {
        return null;
      }

      return payload.sub;
    } catch {
      return null;
    }
  }

  revokeRefreshToken(token: string): void {
    this.revokedTokens.add(token);
  }

  async validateUser(profile: OAuthProfile): Promise<UserDocument> {
    return this.usersService.findOrCreateByOAuth(profile);
  }
}
