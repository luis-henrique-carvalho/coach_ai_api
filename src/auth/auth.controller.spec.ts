import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController, AuthRequest } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    generateTokens: jest.fn(),
    validateRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: { [key: string]: string } = {
        FRONTEND_URL: 'http://localhost:5173',
      };
      return config[key];
    }),
  };

  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.jpg',
    providers: {
      google: { id: 'google-123' },
    },
  };

  const mockResponse = {} as Record<string, jest.Mock>;

  mockResponse.cookie = jest.fn(function (this: void) {
    return mockResponse;
  });
  mockResponse.clearCookie = jest.fn(function (this: void) {
    return mockResponse;
  });
  mockResponse.redirect = jest.fn(function (this: void) {
    return mockResponse;
  });
  mockResponse.json = jest.fn(function (this: void) {
    return mockResponse;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('googleCallback', () => {
    it('should set httpOnly cookies and redirect to frontend', () => {
      const tokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      };

      mockAuthService.generateTokens.mockReturnValue(tokens);

      const req = { user: mockUser } as unknown as AuthRequest;
      controller.googleCallback(req, mockResponse as any);

      expect(mockAuthService.generateTokens).toHaveBeenCalledWith(mockUser._id);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        tokens.accessToken,
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000, // 15 minutes
        }),
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        tokens.refreshToken,
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        }),
      );
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'http://localhost:5173',
      );
    });
  });

  describe('githubCallback', () => {
    it('should set httpOnly cookies and redirect to frontend', () => {
      const tokens = {
        accessToken: 'access-token-789',
        refreshToken: 'refresh-token-012',
      };

      mockAuthService.generateTokens.mockReturnValue(tokens);

      const req = { user: mockUser } as unknown as AuthRequest;
      controller.githubCallback(req, mockResponse as any);

      expect(mockAuthService.generateTokens).toHaveBeenCalledWith(mockUser._id);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        tokens.accessToken,
        expect.objectContaining({
          httpOnly: true,
        }),
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        tokens.refreshToken,
        expect.objectContaining({
          httpOnly: true,
        }),
      );
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'http://localhost:5173',
      );
    });
  });

  describe('getProfile', () => {
    it('should return current user', () => {
      const req = { user: mockUser } as unknown as AuthRequest;

      const result = controller.getProfile(req);

      expect(result).toEqual({
        id: mockUser._id,
        email: mockUser.email,
        name: mockUser.name,
        avatar: mockUser.avatar,
      });
    });
  });

  describe('refresh', () => {
    it('should generate new tokens from refresh token', () => {
      const oldRefreshToken = 'old-refresh-token';
      const userId = '507f1f77bcf86cd799439011';
      const newTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      const req = {
        cookies: {
          refresh_token: oldRefreshToken,
        },
      } as unknown as AuthRequest;

      mockAuthService.validateRefreshToken.mockReturnValue(userId);
      mockAuthService.generateTokens.mockReturnValue(newTokens);

      controller.refresh(req, mockResponse as any);

      expect(mockAuthService.validateRefreshToken).toHaveBeenCalledWith(
        oldRefreshToken,
      );
      expect(mockAuthService.generateTokens).toHaveBeenCalledWith(userId);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        newTokens.accessToken,
        expect.anything(),
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        newTokens.refreshToken,
        expect.anything(),
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
    });

    it('should throw error if refresh token is invalid', () => {
      const req = {
        cookies: {
          refresh_token: 'invalid-token',
        },
      } as unknown as AuthRequest;

      mockAuthService.validateRefreshToken.mockReturnValue(null);

      expect(() => controller.refresh(req, mockResponse as any)).toThrow();
    });
  });

  describe('logout', () => {
    it('should clear cookies and revoke refresh token', () => {
      const refreshToken = 'token-to-revoke';
      const req = {
        cookies: {
          refresh_token: refreshToken,
        },
      } as unknown as AuthRequest;

      controller.logout(req, mockResponse as any);

      expect(mockAuthService.revokeRefreshToken).toHaveBeenCalledWith(
        refreshToken,
      );
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('access_token');
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
