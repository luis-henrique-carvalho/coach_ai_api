import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserResponseDto } from './dto/user-response.dto';

export interface AuthRequest extends Request {
  user?: {
    _id: string;
    email: string;
    name: string;
    avatar: string;
  };
}

@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async google() {
    // Guard redirects to Google OAuth
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() req: AuthRequest, @Res() res: Response) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const tokens = this.authService.generateTokens(user._id);

    // Set httpOnly cookies
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to frontend
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    res.redirect(frontendUrl);
  }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  async github() {
    // Guard redirects to GitHub OAuth
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  githubCallback(@Req() req: AuthRequest, @Res() res: Response) {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const tokens = this.authService.generateTokens(user._id);

    // Set httpOnly cookies
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to frontend
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    res.redirect(frontendUrl);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() req: AuthRequest): UserResponseDto {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    };
  }

  @Post('refresh')
  refresh(@Req() req: AuthRequest, @Res() res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token not found');
    }

    const userId = this.authService.validateRefreshToken(refreshToken);

    if (!userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = this.authService.generateTokens(userId);

    // Set new cookies
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ success: true });
  }

  @Post('logout')
  logout(@Req() req: AuthRequest, @Res() res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (typeof refreshToken === 'string') {
      this.authService.revokeRefreshToken(refreshToken);
    }

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ success: true });
  }
}
