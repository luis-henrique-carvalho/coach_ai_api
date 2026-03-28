import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';

describe('UsersService', () => {
  let service: UsersService;

  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.jpg',
    providers: {
      google: { id: 'google-123' },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(this),
  };

  const mockUserModel = {
    new: jest.fn().mockResolvedValue(mockUser),
    constructor: jest.fn().mockResolvedValue(mockUser),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreateByOAuth', () => {
    it('should create a new user if not exists', async () => {
      const oauthProfile = {
        provider: 'google',
        providerId: 'google-123',
        email: 'newuser@example.com',
        name: 'New User',
        avatar: 'https://example.com/new-avatar.jpg',
      };

      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      mockUserModel.create.mockResolvedValue({
        ...mockUser,
        email: oauthProfile.email,
        name: oauthProfile.name,
        avatar: oauthProfile.avatar,
        providers: {
          google: { id: oauthProfile.providerId },
        },
      });

      const result = await service.findOrCreateByOAuth(oauthProfile);

      expect(result.email).toBe(oauthProfile.email);
      expect(result.name).toBe(oauthProfile.name);
      expect(result.providers.google?.id).toBe(oauthProfile.providerId);
    });

    it('should return existing user if found by provider ID', async () => {
      const oauthProfile = {
        provider: 'google',
        providerId: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
      };

      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await service.findOrCreateByOAuth(oauthProfile);

      expect(result).toBeDefined();
      expect(result.email).toBe(mockUser.email);
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('should link multiple providers to same email', async () => {
      const existingUser = {
        ...mockUser,
        providers: {
          google: { id: 'google-123' },
        },
        save: jest.fn().mockResolvedValue(this),
      };

      const githubProfile = {
        provider: 'github',
        providerId: 'github-456',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
      };

      // First lookup by provider ID returns null
      mockUserModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

      // Second lookup by email returns existing user
      mockUserModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(existingUser),
      });

      const result = await service.findOrCreateByOAuth(githubProfile);

      expect(result.providers.google).toBeDefined();
      expect(result.providers.github).toBeDefined();
      expect(existingUser.save).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a user by ID', async () => {
      mockUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await service.findById('507f1f77bcf86cd799439011');

      expect(result).toBeDefined();
      expect(result?._id).toBe(mockUser._id);
    });

    it('should return null if user not found', async () => {
      mockUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });
});
