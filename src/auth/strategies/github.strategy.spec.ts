import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GithubStrategy } from './github.strategy';
import { AuthService } from '../auth.service';

describe('GithubStrategy', () => {
  let strategy: GithubStrategy;

  const mockAuthService = {
    validateUser: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: { [key: string]: string } = {
        GITHUB_CLIENT_ID: 'test-github-client-id',
        GITHUB_CLIENT_SECRET: 'test-github-client-secret',
        GITHUB_CALLBACK_URL: 'http://localhost:3000/api/auth/github/callback',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GithubStrategy,
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

    strategy = module.get<GithubStrategy>(GithubStrategy);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should validate profile and create/return user', async () => {
      const mockProfile = {
        id: 'github-123',
        emails: [{ value: 'test@example.com' }],
        displayName: 'Test User',
        photos: [{ value: 'https://github.com/avatar.jpg' }],
        provider: 'github',
      };

      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://github.com/avatar.jpg',
        providers: {
          github: { id: 'github-123' },
        },
      };

      mockAuthService.validateUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(
        'access-token',
        'refresh-token',
        mockProfile,
      );

      expect(result).toBe(mockUser);
      expect(mockAuthService.validateUser).toHaveBeenCalledWith({
        provider: 'github',
        providerId: 'github-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://github.com/avatar.jpg',
      });
    });

    it('should handle profile without email', async () => {
      const mockProfile = {
        id: 'github-456',
        emails: [],
        displayName: 'No Email User',
        photos: [{ value: 'https://github.com/avatar2.jpg' }],
        provider: 'github',
      };

      const mockUser = {
        _id: '507f1f77bcf86cd799439012',
        email: undefined,
        name: 'No Email User',
        avatar: 'https://github.com/avatar2.jpg',
        providers: {
          github: { id: 'github-456' },
        },
      };

      mockAuthService.validateUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(
        'access-token',
        'refresh-token',
        mockProfile,
      );

      expect(result).toBe(mockUser);
      expect(mockAuthService.validateUser).toHaveBeenCalledWith({
        provider: 'github',
        providerId: 'github-456',
        email: '',
        name: 'No Email User',
        avatar: 'https://github.com/avatar2.jpg',
      });
    });
  });
});
