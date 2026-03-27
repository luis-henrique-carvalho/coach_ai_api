import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService, OAuthProfile } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  private revokedTokens: Set<string> = new Set();

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  async generateTokens(userId: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
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

  async validateRefreshToken(token: string): Promise<string | null> {
    try {
      // Check if token is revoked
      if (this.revokedTokens.has(token)) {
        return null;
      }

      const payload = this.jwtService.verify(token);

      // Verify it's a refresh token
      if (payload.type !== 'refresh') {
        return null;
      }

      return payload.sub;
    } catch (error) {
      return null;
    }
  }

  async revokeRefreshToken(token: string): Promise<void> {
    this.revokedTokens.add(token);
  }

  async validateUser(profile: OAuthProfile): Promise<UserDocument> {
    return this.usersService.findOrCreateByOAuth(profile);
  }
}
