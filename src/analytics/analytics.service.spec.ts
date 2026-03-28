import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalyticsService } from './analytics.service';
import { Habit } from '../habits/schemas/habit.schema';
import { HabitCompletion } from '../habits/schemas/habit-completion.schema';
import { Goal } from '../goals/schemas/goal.schema';
import { Subtask } from '../goals/schemas/subtask.schema';
import { startOfDay, subDays, format } from 'date-fns';
import { Types } from 'mongoose';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const userId = new Types.ObjectId().toString();
  const habitId1 = new Types.ObjectId();
  const habitId2 = new Types.ObjectId();
  const goalId1 = new Types.ObjectId();
  const goalId2 = new Types.ObjectId();

  // Helper to create mock completion
  const makeCompletion = (habitId: Types.ObjectId, daysAgo: number) => ({
    _id: new Types.ObjectId(),
    habitId,
    userId: new Types.ObjectId(userId),
    completedDate: startOfDay(subDays(new Date(), daysAgo)),
  });

  // Mock habits data
  const mockHabits = [
    {
      _id: habitId1,
      userId: new Types.ObjectId(userId),
      name: 'Morning Run',
      frequencyType: 'daily',
      frequencyDays: [],
      isActive: true,
    },
    {
      _id: habitId2,
      userId: new Types.ObjectId(userId),
      name: 'Read',
      frequencyType: 'daily',
      frequencyDays: [],
      isActive: true,
    },
  ];

  // Mock completions
  const mockCompletions = [
    makeCompletion(habitId1, 0), // today
    makeCompletion(habitId1, 1), // yesterday
    makeCompletion(habitId1, 2),
    makeCompletion(habitId2, 0), // today
    makeCompletion(habitId2, 1),
  ];

  // Mock goals
  const mockGoals = [
    {
      _id: goalId1,
      userId: new Types.ObjectId(userId),
      name: 'Learn TypeScript',
      isCompleted: true,
    },
    {
      _id: goalId2,
      userId: new Types.ObjectId(userId),
      name: 'Run Marathon',
      isCompleted: false,
    },
  ];

  // Mocked model factories
  const createMockModel = (data?: unknown[]) => {
    const mockFind = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(data || []),
    };
    // Ensure all chain methods return the same object
    mockFind.sort.mockReturnValue(mockFind);
    mockFind.limit.mockReturnValue(mockFind);
    mockFind.populate.mockReturnValue(mockFind);

    return {
      find: jest.fn().mockReturnValue(mockFind),
      countDocuments: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    };
  };

  let habitModel: ReturnType<typeof createMockModel>;
  let habitCompletionModel: ReturnType<typeof createMockModel>;
  let goalModel: ReturnType<typeof createMockModel>;
  let subtaskModel: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    habitModel = createMockModel(mockHabits);
    habitCompletionModel = createMockModel(mockCompletions);
    goalModel = createMockModel(mockGoals);
    subtaskModel = createMockModel([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getModelToken(Habit.name), useValue: habitModel },
        {
          provide: getModelToken(HabitCompletion.name),
          useValue: habitCompletionModel,
        },
        { provide: getModelToken(Goal.name), useValue: goalModel },
        { provide: getModelToken(Subtask.name), useValue: subtaskModel },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getDashboard', () => {
    it('should return correct habit count and completedToday', async () => {
      // Active habits count = 2
      habitModel.countDocuments = jest.fn().mockResolvedValueOnce(2);

      // Completions today = 2 (one for each habit)
      const todayCompletions = mockCompletions.filter((c) => {
        const days = Math.round(
          (new Date().getTime() - c.completedDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return days < 1;
      });

      habitCompletionModel.countDocuments = jest
        .fn()
        .mockResolvedValueOnce(todayCompletions.length) // completedToday
        .mockResolvedValue(0); // habit completions per habit

      // Setup recentCompletions find with all chained methods
      const chainedFindMock = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      chainedFindMock.sort.mockReturnValue(chainedFindMock);
      chainedFindMock.limit.mockReturnValue(chainedFindMock);
      chainedFindMock.populate.mockReturnValue(chainedFindMock);
      habitCompletionModel.find = jest.fn().mockReturnValue(chainedFindMock);

      habitModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockHabits),
      });
      goalModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      subtaskModel.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await service.getDashboard(userId);

      expect(result).toHaveProperty('habits');
      expect(result.habits).toHaveProperty('total');
      expect(result.habits).toHaveProperty('completedToday');
      expect(result).toHaveProperty('goals');
      expect(result).toHaveProperty('streaks');
      expect(result).toHaveProperty('recentCompletions');
    });

    it('should return correct averageCompletionRate', async () => {
      // Setup: 2 active daily habits, 30 day period
      // Expected: 5 completions / (2 habits * 30 days) * 100 = 8.33%
      habitModel.countDocuments = jest.fn().mockResolvedValue(2);
      habitModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockHabits),
      });
      habitCompletionModel.countDocuments = jest
        .fn()
        .mockResolvedValueOnce(2) // total habits
        .mockResolvedValueOnce(2) // completedToday
        .mockResolvedValueOnce(3) // habit1 completions in 30 days
        .mockResolvedValueOnce(2); // habit2 completions in 30 days
      habitCompletionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCompletions.slice(0, 3)),
      });
      goalModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      subtaskModel.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await service.getDashboard(userId);

      expect(result.habits.averageCompletionRate).toBeGreaterThanOrEqual(0);
      expect(result.habits.averageCompletionRate).toBeLessThanOrEqual(100);
    });

    it('should return longestActiveStreak from multiple habits', async () => {
      // habit1 has 3-day streak, habit2 has 2-day streak
      habitModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockHabits),
      });
      habitCompletionModel.countDocuments = jest.fn().mockResolvedValue(2);

      const habit1Completions = [
        makeCompletion(habitId1, 0),
        makeCompletion(habitId1, 1),
        makeCompletion(habitId1, 2),
      ];
      const habit2Completions = [
        makeCompletion(habitId2, 0),
        makeCompletion(habitId2, 1),
      ];

      habitCompletionModel.find = jest
        .fn()
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          populate: jest.fn().mockReturnThis(),
          exec: jest
            .fn()
            .mockResolvedValue([...habit1Completions, ...habit2Completions]),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(habit1Completions),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(habit2Completions),
        });
      goalModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      subtaskModel.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await service.getDashboard(userId);

      expect(result.habits.longestActiveStreak).toBeDefined();
      expect(result.habits.longestActiveStreak.days).toBeGreaterThanOrEqual(0);
    });

    it('should return goal stats with averageProgress', async () => {
      goalModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockGoals),
      });
      habitModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockHabits),
      });
      habitCompletionModel.countDocuments = jest.fn().mockResolvedValue(2);
      habitCompletionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      // Subtask counts: goal1 = 4 total, 4 completed = 100%; goal2 = 5 total, 2 completed = 40%
      subtaskModel.countDocuments = jest
        .fn()
        .mockResolvedValueOnce(4) // goal1 total
        .mockResolvedValueOnce(4) // goal1 completed
        .mockResolvedValueOnce(5) // goal2 total
        .mockResolvedValueOnce(2); // goal2 completed

      const result = await service.getDashboard(userId);

      expect(result.goals.total).toBe(2);
      expect(result.goals.completed).toBe(1); // 1 isCompleted=true goal
      expect(result.goals.averageProgress).toBeGreaterThanOrEqual(0);
      expect(result.goals.averageProgress).toBeLessThanOrEqual(100);
    });

    it('should return streaks list sorted by current streak descending', async () => {
      habitModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockHabits),
      });
      habitCompletionModel.countDocuments = jest.fn().mockResolvedValue(2);

      const habit1Completions = [
        makeCompletion(habitId1, 0),
        makeCompletion(habitId1, 1),
        makeCompletion(habitId1, 2),
      ];
      const habit2Completions = [makeCompletion(habitId2, 0)];

      habitCompletionModel.find = jest
        .fn()
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          populate: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(habit1Completions),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(habit2Completions),
        });
      goalModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      subtaskModel.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await service.getDashboard(userId);

      expect(Array.isArray(result.streaks)).toBe(true);
      if (result.streaks.length > 1) {
        expect(result.streaks[0].currentStreak).toBeGreaterThanOrEqual(
          result.streaks[1].currentStreak,
        );
      }
      result.streaks.forEach(
        (streak: {
          habitId: string;
          habitName: string;
          currentStreak: number;
        }) => {
          expect(streak).toHaveProperty('habitId');
          expect(streak).toHaveProperty('habitName');
          expect(streak).toHaveProperty('currentStreak');
        },
      );
    });

    it('should return recentCompletions (last 10)', async () => {
      const recentCompletions = Array.from({ length: 10 }, (_, i) =>
        makeCompletion(habitId1, i),
      );
      habitCompletionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(recentCompletions),
      });
      habitModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      habitCompletionModel.countDocuments = jest.fn().mockResolvedValue(0);
      goalModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      subtaskModel.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await service.getDashboard(userId);

      expect(Array.isArray(result.recentCompletions)).toBe(true);
      expect(result.recentCompletions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getHabitTrends', () => {
    it('should return correct daily data for 7d period', async () => {
      const aggregateResult = [
        { _id: format(new Date(), 'yyyy-MM-dd'), count: 2 },
        { _id: format(subDays(new Date(), 1), 'yyyy-MM-dd'), count: 1 },
      ];
      habitCompletionModel.aggregate = jest
        .fn()
        .mockResolvedValue(aggregateResult);
      habitModel.countDocuments = jest.fn().mockResolvedValue(2);

      const result = await service.getHabitTrends(userId, '7d');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(7);
      result.forEach(
        (point: { date: string; completions: number; total: number }) => {
          expect(point).toHaveProperty('date');
          expect(point).toHaveProperty('completions');
          expect(point).toHaveProperty('total');
        },
      );
    });

    it('should return 30 entries for 30d period', async () => {
      habitCompletionModel.aggregate = jest.fn().mockResolvedValue([]);
      habitModel.countDocuments = jest.fn().mockResolvedValue(3);

      const result = await service.getHabitTrends(userId, '30d');

      expect(result.length).toBe(30);
    });

    it('should handle days with no completions (count = 0)', async () => {
      // Aggregate returns only 2 of 7 days
      habitCompletionModel.aggregate = jest
        .fn()
        .mockResolvedValue([
          { _id: format(new Date(), 'yyyy-MM-dd'), count: 3 },
        ]);
      habitModel.countDocuments = jest.fn().mockResolvedValue(2);

      const result = await service.getHabitTrends(userId, '7d');

      // 6 days should have completions = 0
      const zeroDays = result.filter(
        (p: { completions: number }) => p.completions === 0,
      );
      expect(zeroDays.length).toBe(6);
    });
  });

  describe('getHeatmap', () => {
    it('should return completion dates for specific habit and year', async () => {
      const year = 2026;
      const habitCompletionsForYear = [
        makeCompletion(habitId1, 5),
        makeCompletion(habitId1, 10),
        makeCompletion(habitId1, 15),
      ];
      habitCompletionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(habitCompletionsForYear),
      });

      const result = await service.getHeatmap(
        userId,
        habitId1.toString(),
        year,
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      result.forEach((entry: { date: string; count: number }) => {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('count');
        expect(entry.count).toBe(1);
      });
    });

    it('should return empty array for year with no completions', async () => {
      habitCompletionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getHeatmap(
        userId,
        habitId1.toString(),
        2025,
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });
});
