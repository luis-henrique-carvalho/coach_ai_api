import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
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

  async register(
    email: string,
    name: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const rounds = this.configService.get<number>('BCRYPT_ROUNDS') ?? 12;
    const hashedPassword = await bcrypt.hash(password, rounds);
    const user = await this.usersService.createWithEmailPassword(
      email,
      name,
      hashedPassword,
    );
    return this.generateTokens(user._id.toString());
  }

  async loginWithEmailPassword(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findByEmail(email, true);

    // Use a generic error message to avoid leaking whether email exists
    const invalid = new UnauthorizedException('Invalid credentials');

    if (!user) {
      throw invalid;
    }

    if (!user.password) {
      // OAuth-only account: no password set
      throw invalid;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw invalid;
    }

    return this.generateTokens(user._id.toString());
  }
}
