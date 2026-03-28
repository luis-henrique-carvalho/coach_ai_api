import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User, UserDocument } from '../src/users/schemas/user.schema';
import { Habit, HabitDocument } from '../src/habits/schemas/habit.schema';
import {
  HabitCompletion,
  HabitCompletionDocument,
} from '../src/habits/schemas/habit-completion.schema';
import { Goal, GoalDocument } from '../src/goals/schemas/goal.schema';
import { AuthService } from '../src/auth/auth.service';
import { startOfDay, subDays } from 'date-fns';

describe('AnalyticsController (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<UserDocument>;
  let habitModel: Model<HabitDocument>;
  let habitCompletionModel: Model<HabitCompletionDocument>;
  let goalModel: Model<GoalDocument>;
  let authService: AuthService;
  let connection: Connection;

  let testAccessToken: string;
  let testUserId: string;
  let habit1Id: string;
  let habit2Id: string;

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
    goalModel = moduleFixture.get(getModelToken(Goal.name));
    authService = moduleFixture.get(AuthService);
    connection = moduleFixture.get<Connection>(getConnectionToken());

    await app.init();

    // Create a test user and generate JWT token
    const testUser = await userModel.create({
      email: 'analytics-e2e@example.com',
      name: 'Analytics E2E User',
      providers: {
        google: { id: 'google-analytics-e2e-test' },
      },
    });
    testUserId = testUser._id.toString();
    const tokens = authService.generateTokens(testUserId);
    testAccessToken = tokens.accessToken;

    // Create 2 habits
    const habit1 = await habitModel.create({
      userId: new Types.ObjectId(testUserId),
      name: 'Morning Run',
      frequencyType: 'daily',
      frequencyDays: [],
      isActive: true,
    });
    habit1Id = habit1._id.toString();

    const habit2 = await habitModel.create({
      userId: new Types.ObjectId(testUserId),
      name: 'Read Books',
      frequencyType: 'daily',
      frequencyDays: [],
      isActive: true,
    });
    habit2Id = habit2._id.toString();

    // Add completions for last 7 days for habit1
    for (let i = 0; i < 7; i++) {
      await habitCompletionModel.create({
        habitId: new Types.ObjectId(habit1Id),
        userId: new Types.ObjectId(testUserId),
        completedDate: startOfDay(subDays(new Date(), i)),
      });
    }

    // Add completions for last 3 days for habit2
    for (let i = 0; i < 3; i++) {
      await habitCompletionModel.create({
        habitId: new Types.ObjectId(habit2Id),
        userId: new Types.ObjectId(testUserId),
        completedDate: startOfDay(subDays(new Date(), i)),
      });
    }

    // Create a goal
    await goalModel.create({
      userId: new Types.ObjectId(testUserId),
      name: 'Run a Marathon',
      isCompleted: false,
    });
  });

  afterAll(async () => {
    // Cleanup
    await habitCompletionModel.deleteMany({ userId: new Types.ObjectId(testUserId) });
    await habitModel.deleteMany({ userId: new Types.ObjectId(testUserId) });
    await goalModel.deleteMany({ userId: new Types.ObjectId(testUserId) });
    await userModel.deleteMany({ _id: new Types.ObjectId(testUserId) });

    await app.close();
    if (connection) {
      await connection.close();
    }
  });

  describe('Authentication', () => {
    it('should return 401 without JWT for GET /analytics/dashboard', async () => {
      return request(app.getHttpServer())
        .get('/analytics/dashboard')
        .expect(401);
    });

    it('should return 401 without JWT for GET /analytics/habits/trends', async () => {
      return request(app.getHttpServer())
        .get('/analytics/habits/trends')
        .expect(401);
    });

    it('should return 401 without JWT for GET /analytics/habits/:id/heatmap', async () => {
      return request(app.getHttpServer())
        .get(`/analytics/habits/${habit1Id}/heatmap`)
        .expect(401);
    });
  });

  describe('GET /analytics/dashboard', () => {
    it('should return dashboard with correct habit count', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/dashboard')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(res.body.habits.total).toBe(2);
      expect(res.body.habits).toHaveProperty('completedToday');
      expect(res.body.habits).toHaveProperty('averageCompletionRate');
      expect(res.body.habits).toHaveProperty('longestActiveStreak');
    });

    it('should return completedToday = 2 (both habits completed today)', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/dashboard')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(res.body.habits.completedToday).toBe(2);
    });

    it('should return streaks array with entries', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/dashboard')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(Array.isArray(res.body.streaks)).toBe(true);
      expect(res.body.streaks.length).toBeGreaterThan(0);
      expect(res.body.streaks[0]).toHaveProperty('habitId');
      expect(res.body.streaks[0]).toHaveProperty('habitName');
      expect(res.body.streaks[0]).toHaveProperty('currentStreak');
    });

    it('should return goal stats', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/dashboard')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(res.body.goals.total).toBe(1);
      expect(res.body.goals).toHaveProperty('completed');
      expect(res.body.goals).toHaveProperty('averageProgress');
    });

    it('should return recentCompletions array', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/dashboard')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(Array.isArray(res.body.recentCompletions)).toBe(true);
    });
  });

  describe('GET /analytics/habits/trends', () => {
    it('should return 7 data points for ?period=7d', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/habits/trends?period=7d')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(7);
    });

    it('should return 30 data points for ?period=30d (default)', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/habits/trends')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(30);
    });

    it('should return data points with correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/habits/trends?period=7d')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      res.body.forEach((point: { date: string; completions: number; total: number }) => {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('completions');
        expect(point).toHaveProperty('total');
        expect(typeof point.completions).toBe('number');
      });
    });

    it('should return 400 for invalid period', async () => {
      return request(app.getHttpServer())
        .get('/analytics/habits/trends?period=invalid')
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(400);
    });
  });

  describe('GET /analytics/habits/:id/heatmap', () => {
    it('should return heatmap data for specific habit and year', async () => {
      const res = await request(app.getHttpServer())
        .get(`/analytics/habits/${habit1Id}/heatmap?year=2026`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // We added 7 days of completions for habit1 in 2026
      expect(res.body.length).toBe(7);
    });

    it('should return heatmap entries with date and count', async () => {
      const res = await request(app.getHttpServer())
        .get(`/analytics/habits/${habit1Id}/heatmap?year=2026`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      res.body.forEach((entry: { date: string; count: number }) => {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('count');
        expect(entry.count).toBe(1);
      });
    });

    it('should return empty array for year with no completions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/analytics/habits/${habit1Id}/heatmap?year=2020`)
        .set('Cookie', [`access_token=${testAccessToken}`])
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });
});
