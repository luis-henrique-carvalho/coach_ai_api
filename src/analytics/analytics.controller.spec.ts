import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TrendsQueryDto } from './dto/trends-query.dto';
import { HeatmapQueryDto } from './dto/heatmap-query.dto';
import { Types } from 'mongoose';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: jest.Mocked<AnalyticsService>;

  const userId = new Types.ObjectId().toString();
  const mockReq = { user: { _id: userId, email: 'test@example.com' } };

  const mockDashboard = {
    habits: {
      total: 3,
      completedToday: 2,
      averageCompletionRate: 75.5,
      longestActiveStreak: { habitName: 'Morning Run', days: 7 },
    },
    goals: { total: 2, completed: 1, averageProgress: 50 },
    streaks: [{ habitId: 'id1', habitName: 'Run', currentStreak: 7 }],
    recentCompletions: [],
  };

  const mockTrends = [
    { date: '2026-03-28', completions: 3, total: 5 },
    { date: '2026-03-27', completions: 2, total: 5 },
  ];

  const mockHeatmap = [
    { date: '2026-03-01', count: 1 },
    { date: '2026-03-15', count: 1 },
  ];

  beforeEach(async () => {
    const mockService = {
      getDashboard: jest.fn().mockResolvedValue(mockDashboard),
      getHabitTrends: jest.fn().mockResolvedValue(mockTrends),
      getHeatmap: jest.fn().mockResolvedValue(mockHeatmap),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: mockService }],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    analyticsService = module.get(AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /analytics/dashboard', () => {
    it('should call getDashboard with userId from req.user', async () => {
      const result = await controller.getDashboard(mockReq as never);

      expect(analyticsService.getDashboard).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockDashboard);
    });

    it('should return the dashboard data', async () => {
      const result = await controller.getDashboard(mockReq as never);

      expect(result.habits.total).toBe(3);
      expect(result.habits.completedToday).toBe(2);
      expect(result.goals.total).toBe(2);
      expect(result.streaks).toHaveLength(1);
    });
  });

  describe('GET /analytics/habits/trends', () => {
    it('should call getHabitTrends with userId and period from query', async () => {
      const query: TrendsQueryDto = { period: '7d' };
      const result = await controller.getHabitTrends(mockReq as never, query);

      expect(analyticsService.getHabitTrends).toHaveBeenCalledWith(
        userId,
        '7d',
      );
      expect(result).toEqual(mockTrends);
    });

    it('should use default period 30d when not specified', async () => {
      const query: TrendsQueryDto = {};
      await controller.getHabitTrends(mockReq as never, query);

      expect(analyticsService.getHabitTrends).toHaveBeenCalledWith(
        userId,
        undefined,
      );
    });
  });

  describe('GET /analytics/habits/:id/heatmap', () => {
    it('should call getHeatmap with userId, habitId and year', async () => {
      const habitId = new Types.ObjectId().toString();
      const query: HeatmapQueryDto = { year: 2026 };
      const result = await controller.getHeatmap(
        mockReq as never,
        habitId,
        query,
      );

      expect(analyticsService.getHeatmap).toHaveBeenCalledWith(
        userId,
        habitId,
        2026,
      );
      expect(result).toEqual(mockHeatmap);
    });

    it('should use current year when year not specified', async () => {
      const habitId = new Types.ObjectId().toString();
      const query: HeatmapQueryDto = {};
      await controller.getHeatmap(mockReq as never, habitId, query);

      expect(analyticsService.getHeatmap).toHaveBeenCalledWith(
        userId,
        habitId,
        undefined,
      );
    });
  });
});
