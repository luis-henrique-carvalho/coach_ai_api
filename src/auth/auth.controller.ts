import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserResponseDto } from './dto/user-response.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthRequest extends Request {
  cookies: Record<string, string | undefined>;
  user?: {
    _id: string;
    email: string;
    name: string;
    avatar: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  // --- Email/Password endpoints ---

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() registerDto: RegisterDto,
    @Res() res: Response,
  ): Promise<void> {
    const tokens = await this.authService.register(
      registerDto.email,
      registerDto.name,
      registerDto.password,
    );

    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ success: true });
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginDto, @Res() res: Response): Promise<void> {
    const tokens = await this.authService.loginWithEmailPassword(
      loginDto.email,
      loginDto.password,
    );

    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ success: true });
  }

  // --- Private helpers ---

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  // --- OAuth endpoints ---

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
  @HttpCode(200)
  refresh(@Req() req: AuthRequest, @Res() res: Response) {
    const refreshToken: string | undefined = req.cookies['refresh_token'];
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
  @HttpCode(200)
  logout(@Req() req: AuthRequest, @Res() res: Response) {
    const refreshToken: string | undefined = req.cookies['refresh_token'];
    if (typeof refreshToken === 'string') {
      this.authService.revokeRefreshToken(refreshToken);
    }

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ success: true });
  }
}
