import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User, UserDocument } from '../src/users/schemas/user.schema';
import { Habit, HabitDocument } from '../src/habits/schemas/habit.schema';
import {
  HabitCompletion,
  HabitCompletionDocument,
} from '../src/habits/schemas/habit-completion.schema';
import { AuthService } from '../src/auth/auth.service';

describe('HabitsController (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<UserDocument>;
  let habitModel: Model<HabitDocument>;
  let habitCompletionModel: Model<HabitCompletionDocument>;
  let authService: AuthService;
  let connection: Connection;

  let testAccessToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    userModel = moduleFixture.get(getModelToken(User.name));
    habitModel = moduleFixture.get(getModelToken(Habit.name));
    habitCompletionModel = moduleFixture.get(
      getModelToken(HabitCompletion.name),
    );
    authService = moduleFixture.get(AuthService);
    connection = moduleFixture.get<Connection>(getConnectionToken());

    await app.init();

    // Create a test user and generate JWT token
    const testUser = await userModel.create({
      email: 'habits-e2e@example.com',
      name: 'Habits E2E User',
      providers: {
        google: { id: 'google-habits-e2e-test' },
      },
    });
    testUserId = testUser._id.toString();
    const tokens = authService.generateTokens(testUserId);
    testAccessToken = tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (connection) {
      await connection.close();
    }
  });

  beforeEach(async () => {
    // Clear habits and completions before each test
    await habitModel.deleteMany({ userId: testUserId });
    await habitCompletionModel.deleteMany({ userId: testUserId });
  });

  describe('Authentication', () => {
    it('should return 401 without JWT for GET /habits', () => {
      return request(app.getHttpServer() as string)
        .get('/habits')
        .expect(401);
    });

    it('should return 401 without JWT for POST /habits', () => {
      return request(app.getHttpServer() as string)
        .post('/habits')
        .send({ name: 'Test', frequencyType: 'daily' })
        .expect(401);
    });
  });

  describe('Full create -> complete -> streak -> delete flow', () => {
    it('should complete the full habit lifecycle', async () => {
      // 1. Create a habit
      const createResponse = await request(app.getHttpServer() as string)
        .post('/habits')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .send({
          name: 'Morning Run',
          description: 'Run every morning',
          frequencyType: 'daily',
        })
        .expect(201);

      const habit = createResponse.body as Record<string, unknown>;
      expect(habit.name).toBe('Morning Run');
      expect(habit._id).toBeDefined();
      const createdHabitId = habit._id as string;

      // 2. Get all habits — should have streak stats
      const getAllResponse = await request(app.getHttpServer() as string)
        .get('/habits')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      const habits = getAllResponse.body as Record<string, unknown>[];
      expect(habits).toHaveLength(1);
      expect(habits[0]).toHaveProperty('currentStreak');
      expect(habits[0]).toHaveProperty('bestStreak');
      expect(habits[0]).toHaveProperty('totalCompletions');
      expect(habits[0]).toHaveProperty('isCompletedToday');

      // 3. Mark habit complete today
      const completeResponse = await request(app.getHttpServer() as string)
        .post(`/habits/${createdHabitId}/complete`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(201);

      const completion = completeResponse.body as Record<string, unknown>;
      expect(completion.habitId).toBe(createdHabitId);

      // 4. Check streak stats after completion
      const getOneResponse = await request(app.getHttpServer() as string)
        .get(`/habits/${createdHabitId}`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      const habitWithStats = getOneResponse.body as Record<string, unknown>;
      expect(habitWithStats.currentStreak).toBe(1);
      expect(habitWithStats.isCompletedToday).toBe(true);
      expect(habitWithStats.totalCompletions).toBe(1);

      // 5. Get completion history
      const historyResponse = await request(app.getHttpServer() as string)
        .get(`/habits/${createdHabitId}/completions`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      const history = historyResponse.body as Record<string, unknown>[];
      expect(history).toHaveLength(1);

      // 6. Uncomplete today
      await request(app.getHttpServer() as string)
        .delete(`/habits/${createdHabitId}/complete`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      // 7. Verify uncompleted
      const afterUncomplete = await request(app.getHttpServer() as string)
        .get(`/habits/${createdHabitId}`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      const uncompleted = afterUncomplete.body as Record<string, unknown>;
      expect(uncompleted.isCompletedToday).toBe(false);

      // 8. Update the habit
      await request(app.getHttpServer() as string)
        .patch(`/habits/${createdHabitId}`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .send({ name: 'Evening Run' })
        .expect(200);

      // 9. Delete the habit
      await request(app.getHttpServer() as string)
        .delete(`/habits/${createdHabitId}`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      // 10. Verify deleted
      await request(app.getHttpServer() as string)
        .get(`/habits/${createdHabitId}`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(404);
    });
  });

  describe('POST /habits', () => {
    it('should create a daily habit', async () => {
      const response = await request(app.getHttpServer() as string)
        .post('/habits')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .send({
          name: 'Read Books',
          frequencyType: 'daily',
        })
        .expect(201);

      const habit = response.body as Record<string, unknown>;
      expect(habit.name).toBe('Read Books');
      expect(habit.frequencyType).toBe('daily');
    });

    it('should create a custom frequency habit', async () => {
      const response = await request(app.getHttpServer() as string)
        .post('/habits')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .send({
          name: 'Gym',
          frequencyType: 'custom',
          frequencyDays: [1, 3, 5],
        })
        .expect(201);

      const habit = response.body as Record<string, unknown>;
      expect(habit.frequencyType).toBe('custom');
      expect(habit.frequencyDays).toEqual([1, 3, 5]);
    });

    it('should return 400 for invalid body (missing name)', () => {
      return request(app.getHttpServer() as string)
        .post('/habits')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .send({ frequencyType: 'daily' })
        .expect(400);
    });
  });

  describe('POST /habits/:id/complete — double completion', () => {
    it('should return 409 for double completion on same day', async () => {
      // Create a habit
      const createResponse = await request(app.getHttpServer() as string)
        .post('/habits')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .send({ name: 'Test Habit', frequencyType: 'daily' })
        .expect(201);

      const habitId = (createResponse.body as Record<string, unknown>)
        ._id as string;

      // Complete once
      await request(app.getHttpServer() as string)
        .post(`/habits/${habitId}/complete`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(201);

      // Complete again — should 409
      await request(app.getHttpServer() as string)
        .post(`/habits/${habitId}/complete`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(409);
    });
  });

  describe('GET /habits/:id — 404 for non-existent', () => {
    it('should return 404 for non-existent habit', () => {
      return request(app.getHttpServer() as string)
        .get('/habits/507f1f77bcf86cd799439099')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(404);
    });
  });

  describe('PATCH /habits/:id — 404 for non-existent', () => {
    it('should return 404 for non-existent habit', () => {
      return request(app.getHttpServer() as string)
        .patch('/habits/507f1f77bcf86cd799439099')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('Completions pagination', () => {
    it('should return paginated completion history with limit and offset', async () => {
      const createResponse = await request(app.getHttpServer() as string)
        .post('/habits')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .send({ name: 'Paged Habit', frequencyType: 'daily' })
        .expect(201);

      const habitId = (createResponse.body as Record<string, unknown>)
        ._id as string;

      // Complete today
      await request(app.getHttpServer() as string)
        .post(`/habits/${habitId}/complete`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(201);

      const response = await request(app.getHttpServer() as string)
        .get(`/habits/${habitId}/completions?limit=5&offset=0`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      const completions = response.body as Record<string, unknown>[];
      expect(Array.isArray(completions)).toBe(true);
      expect(completions.length).toBeLessThanOrEqual(5);
    });
  });
});
