import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './google.strategy';
import { AuthService } from '../auth.service';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;

  const mockAuthService = {
    validateUser: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: { [key: string]: string } = {
        GOOGLE_CLIENT_ID: 'test-google-client-id',
        GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
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

    strategy = module.get<GoogleStrategy>(GoogleStrategy);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should validate profile and create/return user', async () => {
      const mockProfile = {
        id: 'google-123',
        emails: [{ value: 'test@example.com' }],
        displayName: 'Test User',
        photos: [{ value: 'https://example.com/avatar.jpg' }],
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

      mockAuthService.validateUser.mockResolvedValue(mockUser);

      const mockDone = jest.fn();
      await strategy.validate(
        'access-token',
        'refresh-token',
        mockProfile,
        mockDone,
      );

      expect(mockDone).toHaveBeenCalledWith(null, mockUser);
      expect(mockAuthService.validateUser).toHaveBeenCalledWith({
        provider: 'google',
        providerId: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
      });
    });

    it('should handle profile without photo', async () => {
      const mockProfile = {
        id: 'google-456',
        emails: [{ value: 'nophoto@example.com', verified: true }],
        displayName: 'No Photo User',
        photos: [],
        provider: 'google',
      };

      const mockUser = {
        _id: '507f1f77bcf86cd799439012',
        email: 'nophoto@example.com',
        name: 'No Photo User',
        avatar: undefined,
        providers: {
          google: { id: 'google-456' },
        },
      };

      mockAuthService.validateUser.mockResolvedValue(mockUser);

      const mockDone = jest.fn();
      await strategy.validate(
        'access-token',
        'refresh-token',
        mockProfile,
        mockDone,
      );

      expect(mockDone).toHaveBeenCalledWith(null, mockUser);
      expect(mockAuthService.validateUser).toHaveBeenCalledWith({
        provider: 'google',
        providerId: 'google-456',
        email: 'nophoto@example.com',
        name: 'No Photo User',
        avatar: '',
      });
    });
  });
});
