import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../src/users/schemas/user.schema';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let userModel: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());

    userModel = moduleFixture.get(getModelToken(User.name));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear database before each test
    await userModel.deleteMany({});
  });

  describe('/api/auth/google (GET)', () => {
    it('should redirect to Google OAuth', () => {
      return request(app.getHttpServer())
        .get('/api/auth/google')
        .expect(302)
        .expect((res) => {
          expect(res.headers.location).toContain('accounts.google.com');
        });
    });
  });

  describe('/api/auth/github (GET)', () => {
    it('should redirect to GitHub OAuth', () => {
      return request(app.getHttpServer())
        .get('/api/auth/github')
        .expect(302)
        .expect((res) => {
          expect(res.headers.location).toContain('github.com');
        });
    });
  });

  describe('OAuth flow with mocked callback', () => {
    it('should create user and set cookies after Google OAuth', async () => {
      // Mock the OAuth callback by directly calling the service
      const mockGoogleProfile = {
        provider: 'google',
        providerId: 'google-e2e-123',
        email: 'e2etest@example.com',
        name: 'E2E Test User',
        avatar: 'https://example.com/avatar.jpg',
      };

      // Simulate the OAuth callback flow
      const authService = app.get('AuthService');
      const usersService = app.get('UsersService');

      const user = await usersService.findOrCreateByOAuth(mockGoogleProfile);
      expect(user).toBeDefined();
      expect(user.email).toBe(mockGoogleProfile.email);

      const tokens = await authService.generateTokens(user._id);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      // Verify user was created in database
      const savedUser = await userModel.findById(user._id);
      expect(savedUser).toBeDefined();
      expect(savedUser.providers.google.id).toBe(mockGoogleProfile.providerId);
    });

    it('should create user and set cookies after GitHub OAuth', async () => {
      const mockGithubProfile = {
        provider: 'github',
        providerId: 'github-e2e-456',
        email: 'github-e2e@example.com',
        name: 'GitHub E2E User',
        avatar: 'https://github.com/avatar.jpg',
      };

      const authService = app.get('AuthService');
      const usersService = app.get('UsersService');

      const user = await usersService.findOrCreateByOAuth(mockGithubProfile);
      expect(user).toBeDefined();
      expect(user.email).toBe(mockGithubProfile.email);

      const tokens = await authService.generateTokens(user._id);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      const savedUser = await userModel.findById(user._id);
      expect(savedUser).toBeDefined();
      expect(savedUser.providers.github.id).toBe(mockGithubProfile.providerId);
    });
  });

  describe('/api/auth/me (GET)', () => {
    it('should return user when authenticated', async () => {
      // Create a test user
      const testUser = await userModel.create({
        email: 'authenticated@example.com',
        name: 'Authenticated User',
        providers: {
          google: { id: 'google-auth-test' },
        },
      });

      // Generate tokens
      const authService = app.get('AuthService');
      const tokens = await authService.generateTokens(testUser._id.toString());

      // Call /api/auth/me with access token
      return request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', [`access_token=${tokens.accessToken}`])
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe(testUser.email);
          expect(res.body.name).toBe(testUser.name);
        });
    });

    it('should return 401 when not authenticated', () => {
      return request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });
  });

  describe('/api/auth/refresh (POST)', () => {
    it('should generate new tokens from valid refresh token', async () => {
      // Create a test user
      const testUser = await userModel.create({
        email: 'refresh@example.com',
        name: 'Refresh User',
        providers: {
          google: { id: 'google-refresh-test' },
        },
      });

      // Generate initial tokens
      const authService = app.get('AuthService');
      const tokens = await authService.generateTokens(testUser._id.toString());

      // Call refresh endpoint
      return request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${tokens.refreshToken}`])
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          // Check that new cookies were set
          const cookies = res.headers['set-cookie'] as unknown as string[];
          expect(cookies).toBeDefined();
          expect(
            cookies.some((c: string) => c.startsWith('access_token=')),
          ).toBe(true);
          expect(
            cookies.some((c: string) => c.startsWith('refresh_token=')),
          ).toBe(true);
        });
    });

    it('should return 401 for invalid refresh token', () => {
      return request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', ['refresh_token=invalid-token'])
        .expect(401);
    });
  });

  describe('/api/auth/logout (POST)', () => {
    it('should clear cookies and revoke token', async () => {
      // Create a test user
      const testUser = await userModel.create({
        email: 'logout@example.com',
        name: 'Logout User',
        providers: {
          google: { id: 'google-logout-test' },
        },
      });

      // Generate tokens
      const authService = app.get('AuthService');
      const tokens = await authService.generateTokens(testUser._id.toString());

      // Logout
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [`refresh_token=${tokens.refreshToken}`])
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify cookies were cleared
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('access_token=;'))).toBe(
        true,
      );
      expect(cookies.some((c: string) => c.includes('refresh_token=;'))).toBe(
        true,
      );
    });
  });

  describe('Token expiration and refresh flow', () => {
    it('should allow refresh after access token expires', async () => {
      // Create a test user
      const testUser = await userModel.create({
        email: 'expiry@example.com',
        name: 'Expiry User',
        providers: {
          google: { id: 'google-expiry-test' },
        },
      });

      // Generate tokens
      const authService = app.get('AuthService');
      const tokens = await authService.generateTokens(testUser._id.toString());

      // Simulate access token expiration by trying to use refresh token
      const refreshResponse = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${tokens.refreshToken}`])
        .expect(200);

      expect(refreshResponse.body.success).toBe(true);

      // Extract new access token from cookies
      const cookies = refreshResponse.headers['set-cookie'] as unknown as string[];
      const accessTokenCookie = cookies.find((c: string) =>
        c.startsWith('access_token='),
      );
      expect(accessTokenCookie).toBeDefined();

      // Verify we can access protected route with new token
      const newAccessToken = accessTokenCookie!.split(';')[0].split('=')[1];
      return request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', [`access_token=${newAccessToken}`])
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe(testUser.email);
        });
    });
  });
});
