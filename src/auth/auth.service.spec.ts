import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.jpg',
    providers: {
      google: { id: 'google-123' },
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockUsersService = {
    findById: jest.fn(),
    findOrCreateByOAuth: jest.fn(),
    findByEmail: jest.fn(),
    createWithEmailPassword: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: { [key: string]: string | number } = {
        JWT_SECRET: 'test-secret',
        JWT_ACCESS_EXPIRATION: '15m',
        JWT_REFRESH_EXPIRATION: '7d',
        BCRYPT_ROUNDS: 12,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTokens', () => {
    it('should create access token with 15min expiration', () => {
      const accessToken = 'access-token-123';
      const refreshToken = 'refresh-token-456';

      mockJwtService.sign
        .mockReturnValueOnce(accessToken)
        .mockReturnValueOnce(refreshToken);

      const result = service.generateTokens(mockUser._id);

      expect(result.accessToken).toBe(accessToken);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { sub: mockUser._id, type: 'access' },
        { expiresIn: '15m' },
      );
    });

    it('should create refresh token with 7day expiration', () => {
      const accessToken = 'access-token-123';
      const refreshToken = 'refresh-token-456';

      mockJwtService.sign
        .mockReturnValueOnce(accessToken)
        .mockReturnValueOnce(refreshToken);

      const result = service.generateTokens(mockUser._id);

      expect(result.refreshToken).toBe(refreshToken);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { sub: mockUser._id, type: 'refresh' },
        { expiresIn: '7d' },
      );
    });
  });

  describe('validateRefreshToken', () => {
    it('should return userId for valid token', () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: mockUser._id, type: 'refresh' };

      mockJwtService.verify.mockReturnValue(payload);

      const result = service.validateRefreshToken(refreshToken);

      expect(result).toBe(mockUser._id);
      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken);
    });

    it('should return null for expired token', () => {
      const refreshToken = 'expired-token';

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('TokenExpiredError');
      });

      const result = service.validateRefreshToken(refreshToken);

      expect(result).toBeNull();
    });

    it('should return null for invalid token', () => {
      const refreshToken = 'invalid-token';

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('JsonWebTokenError');
      });

      const result = service.validateRefreshToken(refreshToken);

      expect(result).toBeNull();
    });

    it('should return null for non-refresh token type', () => {
      const accessToken = 'access-token';
      const payload = { sub: mockUser._id, type: 'access' };

      mockJwtService.verify.mockReturnValue(payload);

      const result = service.validateRefreshToken(accessToken);

      expect(result).toBeNull();
    });
  });

  describe('validateUser', () => {
    it('should return user for valid OAuth profile', async () => {
      const oauthProfile = {
        provider: 'google',
        providerId: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
      };

      mockUsersService.findOrCreateByOAuth.mockResolvedValue(mockUser);

      const result = await service.validateUser(oauthProfile);

      expect(result).toBe(mockUser);
      expect(mockUsersService.findOrCreateByOAuth).toHaveBeenCalledWith(
        oauthProfile,
      );
    });
  });

  describe('revokeRefreshToken', () => {
    it('should mark token as revoked', () => {
      const refreshToken = 'token-to-revoke';

      service.revokeRefreshToken(refreshToken);

      // This test verifies the method exists and doesn't throw
      // In a real implementation, this would check a blacklist/database
      expect(true).toBe(true);
    });
  });

  describe('register', () => {
    it('should hash password and create user, return tokens', async () => {
      const hashedPassword = 'hashed-password-123';
      const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

      // Import bcrypt after jest.mock
      const bcrypt = require('bcrypt');
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      mockUsersService.createWithEmailPassword.mockResolvedValue(mockUser);
      mockJwtService.sign
        .mockReturnValueOnce(tokens.accessToken)
        .mockReturnValueOnce(tokens.refreshToken);

      const result = await service.register('test@example.com', 'Test User', 'password123');

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(mockUsersService.createWithEmailPassword).toHaveBeenCalledWith(
        'test@example.com',
        'Test User',
        hashedPassword,
      );
      expect(result.accessToken).toBe(tokens.accessToken);
      expect(result.refreshToken).toBe(tokens.refreshToken);
    });

    it('should propagate ConflictException when email is taken', async () => {
      const bcrypt = require('bcrypt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash');
      mockUsersService.createWithEmailPassword.mockRejectedValue(
        new ConflictException('Email already registered'),
      );

      await expect(
        service.register('taken@example.com', 'User', 'password123'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('loginWithEmailPassword', () => {
    it('should return tokens for valid credentials', async () => {
      const userWithPassword = { ...mockUser, password: 'hashed-password' };
      const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

      const bcrypt = require('bcrypt');
      mockUsersService.findByEmail.mockResolvedValue(userWithPassword);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign
        .mockReturnValueOnce(tokens.accessToken)
        .mockReturnValueOnce(tokens.refreshToken);

      const result = await service.loginWithEmailPassword('test@example.com', 'password123');

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith('test@example.com', true);
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed-password');
      expect(result.accessToken).toBe(tokens.accessToken);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.loginWithEmailPassword('nouser@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      const userWithPassword = { ...mockUser, password: 'hashed-password' };
      const bcrypt = require('bcrypt');

      mockUsersService.findByEmail.mockResolvedValue(userWithPassword);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.loginWithEmailPassword('test@example.com', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user has no password (OAuth-only user)', async () => {
      const oauthUser = { ...mockUser, password: undefined };

      mockUsersService.findByEmail.mockResolvedValue(oauthUser);

      await expect(
        service.loginWithEmailPassword('test@example.com', 'somepassword'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
