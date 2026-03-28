import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User, UserDocument } from '../src/users/schemas/user.schema';
import { Goal, GoalDocument } from '../src/goals/schemas/goal.schema';
import { Subtask, SubtaskDocument } from '../src/goals/schemas/subtask.schema';
import { AuthService } from '../src/auth/auth.service';

describe('GoalsController (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<UserDocument>;
  let goalModel: Model<GoalDocument>;
  let subtaskModel: Model<SubtaskDocument>;
  let authService: AuthService;
  let connection: Connection;
  let accessToken: string;
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
    goalModel = moduleFixture.get(getModelToken(Goal.name));
    subtaskModel = moduleFixture.get(getModelToken(Subtask.name));
    authService = moduleFixture.get(AuthService);
    connection = moduleFixture.get<Connection>(getConnectionToken());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (connection) {
      await connection.close();
    }
  });

  beforeEach(async () => {
    // Clear data before each test
    await subtaskModel.deleteMany({});
    await goalModel.deleteMany({});
    await userModel.deleteMany({});

    // Create a test user and generate token
    const testUser = await userModel.create({
      email: 'goals-e2e@example.com',
      name: 'Goals E2E User',
      providers: { google: { id: 'goals-google-e2e' } },
    });
    testUserId = testUser._id.toString();
    const tokens = authService.generateTokens(testUserId);
    accessToken = tokens.accessToken;
  });

  describe('POST /goals', () => {
    it('should create a goal and return 201', async () => {
      const response = await request(app.getHttpServer() as string)
        .post('/goals')
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Learn TypeScript', description: 'Master it deeply' })
        .expect(201);

      const body = response.body as Record<string, unknown>;
      expect(body.name).toBe('Learn TypeScript');
      expect(body.description).toBe('Master it deeply');
      expect(body.isCompleted).toBe(false);
      expect(body.userId).toBe(testUserId);
    });

    it('should return 401 without JWT', async () => {
      await request(app.getHttpServer() as string)
        .post('/goals')
        .send({ name: 'Test Goal' })
        .expect(401);
    });

    it('should return 400 for missing name', async () => {
      await request(app.getHttpServer() as string)
        .post('/goals')
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ description: 'No name' })
        .expect(400);
    });
  });

  describe('GET /goals', () => {
    it('should return user goals with progress statistics', async () => {
      // Create a goal in the DB
      await goalModel.create({
        userId: testUserId,
        name: 'My Goal',
        isCompleted: false,
      });

      const response = await request(app.getHttpServer() as string)
        .get('/goals')
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(200);

      const body = response.body as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      expect(body[0]).toHaveProperty('goal');
      expect(body[0]).toHaveProperty('progress');
      expect((body[0].goal as Record<string, unknown>).name).toBe('My Goal');
      expect(body[0].progress).toMatchObject({
        total: 0,
        completed: 0,
        percentage: 0,
      });
    });

    it('should return 401 without JWT', async () => {
      await request(app.getHttpServer() as string)
        .get('/goals')
        .expect(401);
    });
  });

  describe('Full flow: create goal -> subtasks -> nest -> toggle -> progress -> delete', () => {
    it('should complete the full goal workflow', async () => {
      // Step 1: Create goal
      const goalResponse = await request(app.getHttpServer() as string)
        .post('/goals')
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Full Flow Goal', description: 'Testing full flow' })
        .expect(201);

      const goal = goalResponse.body as Record<string, unknown>;
      const goalId = goal._id as string;
      expect(goalId).toBeDefined();

      // Step 2: Add top-level subtask
      const subtask1Response = await request(app.getHttpServer() as string)
        .post(`/goals/${goalId}/subtasks`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Top-level subtask 1' })
        .expect(201);

      const subtask1 = subtask1Response.body as Record<string, unknown>;
      const subtask1Id = subtask1._id as string;
      expect(subtask1.parentId).toBeNull();

      // Step 3: Add another top-level subtask
      await request(app.getHttpServer() as string)
        .post(`/goals/${goalId}/subtasks`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Top-level subtask 2' })
        .expect(201);

      // Step 4: Add a sub-subtask (nested under subtask1)
      const subSubtaskResponse = await request(app.getHttpServer() as string)
        .post(`/goals/${goalId}/subtasks`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Sub-subtask', parentId: subtask1Id })
        .expect(201);

      const subSubtask = subSubtaskResponse.body as Record<string, unknown>;
      expect(subSubtask.parentId).toBe(subtask1Id);

      // Step 5: Toggle subtask1 to completed
      await request(app.getHttpServer() as string)
        .patch(`/goals/${goalId}/subtasks/${subtask1Id}/toggle`)
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(200);

      // Step 6: Get goal with subtask tree
      const detailResponse = await request(app.getHttpServer() as string)
        .get(`/goals/${goalId}`)
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(200);

      const detail = detailResponse.body as Record<string, unknown>;
      expect(detail.goal).toBeDefined();
      expect(Array.isArray(detail.subtasks)).toBe(true);

      // Step 7: Check progress (1 of 3 subtasks completed = 33%)
      const allGoalsResponse = await request(app.getHttpServer() as string)
        .get('/goals')
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(200);

      const allGoals = allGoalsResponse.body as Array<Record<string, unknown>>;
      const goalWithProgress = allGoals.find(
        (g) => (g.goal as Record<string, unknown>)._id === goalId,
      );
      expect(goalWithProgress).toBeDefined();
      expect(
        (goalWithProgress?.progress as Record<string, unknown>).total,
      ).toBe(3);
      expect(
        (goalWithProgress?.progress as Record<string, unknown>).completed,
      ).toBe(1);
      expect(
        (goalWithProgress?.progress as Record<string, unknown>).percentage,
      ).toBe(33);

      // Step 8: Delete goal (should cascade subtasks)
      await request(app.getHttpServer() as string)
        .delete(`/goals/${goalId}`)
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(200);

      // Verify goal is gone
      await request(app.getHttpServer() as string)
        .get(`/goals/${goalId}`)
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(404);

      // Verify all subtasks were cascade deleted
      const remainingSubtasks = await subtaskModel.find({ goalId });
      expect(remainingSubtasks).toHaveLength(0);
    });
  });

  describe('Subtask nesting enforcement', () => {
    it('should reject sub-sub-subtask (3rd level nesting)', async () => {
      // Create goal
      const goalResponse = await request(app.getHttpServer() as string)
        .post('/goals')
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Nesting Test Goal' })
        .expect(201);
      const goalId = (goalResponse.body as Record<string, unknown>)
        ._id as string;

      // Create top-level subtask
      const sub1Response = await request(app.getHttpServer() as string)
        .post(`/goals/${goalId}/subtasks`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Level 1' })
        .expect(201);
      const sub1Id = (sub1Response.body as Record<string, unknown>)
        ._id as string;

      // Create sub-subtask (level 2 — should work)
      const sub2Response = await request(app.getHttpServer() as string)
        .post(`/goals/${goalId}/subtasks`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Level 2', parentId: sub1Id })
        .expect(201);
      const sub2Id = (sub2Response.body as Record<string, unknown>)
        ._id as string;

      // Try to create level 3 — should fail with 400
      await request(app.getHttpServer() as string)
        .post(`/goals/${goalId}/subtasks`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Level 3 — too deep', parentId: sub2Id })
        .expect(400);
    });
  });

  describe('PATCH /goals/:id', () => {
    it('should update goal fields', async () => {
      const goal = await goalModel.create({
        userId: testUserId,
        name: 'Old Name',
        isCompleted: false,
      });

      const response = await request(app.getHttpServer() as string)
        .patch(`/goals/${goal._id.toString()}`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'New Name', isCompleted: true })
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body.name).toBe('New Name');
      expect(body.isCompleted).toBe(true);
    });

    it('should return 404 for non-existent goal', async () => {
      const fakeId = new Types.ObjectId().toHexString();
      await request(app.getHttpServer() as string)
        .patch(`/goals/${fakeId}`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'New Name' })
        .expect(404);
    });
  });

  describe('Subtask CRUD', () => {
    let goalId: string;
    let subtaskId: string;

    beforeEach(async () => {
      const goal = await goalModel.create({
        userId: testUserId,
        name: 'Subtask Test Goal',
        isCompleted: false,
      });
      goalId = goal._id.toString();

      const subtask = await subtaskModel.create({
        goalId,
        userId: testUserId,
        parentId: null,
        name: 'Test Subtask',
        isCompleted: false,
        order: 0,
      });
      subtaskId = subtask._id.toString();
    });

    it('should update a subtask', async () => {
      const response = await request(app.getHttpServer() as string)
        .patch(`/goals/${goalId}/subtasks/${subtaskId}`)
        .set('Cookie', [`access_token=${accessToken}`])
        .send({ name: 'Updated Subtask Name' })
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body.name).toBe('Updated Subtask Name');
    });

    it('should toggle subtask completion', async () => {
      const response = await request(app.getHttpServer() as string)
        .patch(`/goals/${goalId}/subtasks/${subtaskId}/toggle`)
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body.isCompleted).toBe(true);
    });

    it('should delete a subtask and cascade children', async () => {
      // Create a child subtask
      const child = await subtaskModel.create({
        goalId,
        userId: testUserId,
        parentId: subtaskId,
        name: 'Child Subtask',
        isCompleted: false,
        order: 0,
      });

      await request(app.getHttpServer() as string)
        .delete(`/goals/${goalId}/subtasks/${subtaskId}`)
        .set('Cookie', [`access_token=${accessToken}`])
        .expect(200);

      // Verify parent and child are gone
      const remaining = await subtaskModel.find({
        _id: { $in: [subtaskId, child._id.toString()] },
      });
      expect(remaining).toHaveLength(0);
    });
  });
});
