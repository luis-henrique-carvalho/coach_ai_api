import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { HabitsService } from './habits.service';
import { Habit } from './schemas/habit.schema';
import { HabitCompletion } from './schemas/habit-completion.schema';
import { startOfDay, subDays } from 'date-fns';

describe('HabitsService', () => {
  let service: HabitsService;

  const userId = '507f1f77bcf86cd799439011';
  const habitId = '507f1f77bcf86cd799439012';

  const mockHabit = {
    _id: habitId,
    userId,
    name: 'Morning Run',
    description: 'Run every morning',
    frequencyType: 'daily',
    frequencyDays: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn(),
  };

  const mockHabitModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  const mockHabitCompletionModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    deleteMany: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HabitsService,
        {
          provide: getModelToken(Habit.name),
          useValue: mockHabitModel,
        },
        {
          provide: getModelToken(HabitCompletion.name),
          useValue: mockHabitCompletionModel,
        },
      ],
    }).compile();

    service = module.get<HabitsService>(HabitsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('should call habitModel.create() with userId and dto fields', async () => {
      const createDto = {
        name: 'Morning Run',
        frequencyType: 'daily' as const,
        frequencyDays: [],
      };

      mockHabitModel.create.mockResolvedValue(mockHabit);

      const result = await service.create(userId, createDto);

      expect(mockHabitModel.create).toHaveBeenCalledWith({
        userId,
        ...createDto,
      });
      expect(result).toEqual(mockHabit);
    });
  });

  describe('findAllByUser()', () => {
    it('should return habits with streak stats calculated', async () => {
      mockHabitModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockHabit]),
      });

      // No completions for streak calculation
      mockHabitCompletionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });
      mockHabitCompletionModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      mockHabitCompletionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.findAllByUser(userId);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('currentStreak');
      expect(result[0]).toHaveProperty('bestStreak');
      expect(result[0]).toHaveProperty('totalCompletions');
      expect(result[0]).toHaveProperty('isCompletedToday');
    });
  });

  describe('update()', () => {
    it('should find by id+userId, update, and return updated doc', async () => {
      const updateDto = { name: 'Evening Run' };
      const updatedHabit = {
        ...mockHabit,
        name: 'Evening Run',
        save: jest
          .fn()
          .mockResolvedValue({ ...mockHabit, name: 'Evening Run' }),
      };

      mockHabitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedHabit),
      });

      const result = await service.update(habitId, userId, updateDto);

      expect(mockHabitModel.findOne).toHaveBeenCalledWith({
        _id: habitId,
        userId,
      });
      expect(updatedHabit.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for non-existent habit', async () => {
      mockHabitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('nonexistent-id', userId, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('should delete habit and all completions', async () => {
      mockHabitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockHabit),
      });
      mockHabitModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockHabit),
      });
      mockHabitCompletionModel.deleteMany.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 3 }),
      });

      await service.remove(habitId, userId);

      expect(mockHabitModel.findByIdAndDelete).toHaveBeenCalledWith(habitId);
      expect(mockHabitCompletionModel.deleteMany).toHaveBeenCalledWith({
        habitId,
      });
    });
  });

  describe('complete()', () => {
    it('should create completion for today using startOfDay normalization', async () => {
      const today = startOfDay(new Date());
      const mockCompletion = {
        habitId,
        userId,
        completedDate: today,
      };

      mockHabitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockHabit),
      });
      mockHabitCompletionModel.create.mockResolvedValue(mockCompletion);

      const result = await service.complete(habitId, userId);

      expect(mockHabitCompletionModel.create).toHaveBeenCalledWith({
        habitId,
        userId,
        completedDate: today,
      });
      expect(result).toEqual(mockCompletion);
    });

    it('should throw ConflictException if already completed today', async () => {
      mockHabitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockHabit),
      });

      // Simulate MongoDB duplicate key error (E11000)
      const duplicateError = new Error('Duplicate key error') as Error & {
        code: number;
      };
      duplicateError.code = 11000;
      mockHabitCompletionModel.create.mockRejectedValue(duplicateError);

      await expect(service.complete(habitId, userId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('uncomplete()', () => {
    it('should remove today completion', async () => {
      const today = startOfDay(new Date());
      const mockCompletion = { habitId, userId, completedDate: today };

      mockHabitModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockHabit),
      });
      mockHabitCompletionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCompletion),
      });
      mockHabitCompletionModel.deleteOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      });

      await service.uncomplete(habitId, userId);

      expect(mockHabitCompletionModel.deleteOne).toHaveBeenCalledWith({
        habitId,
        completedDate: today,
      });
    });
  });

  describe('calculateStreak()', () => {
    it('should calculate streak of 3 for 3 consecutive daily completions', async () => {
      const today = startOfDay(new Date());
      const completions = [
        { completedDate: today },
        { completedDate: subDays(today, 1) },
        { completedDate: subDays(today, 2) },
      ];

      mockHabitCompletionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(completions),
        }),
      });

      const result = await service.calculateStreak(habitId, 'daily', []);
      expect(result.currentStreak).toBe(3);
    });

    it('should break streak when there is a gap in daily completions', async () => {
      const today = startOfDay(new Date());
      const completions = [
        { completedDate: today },
        // Missing yesterday - gap!
        { completedDate: subDays(today, 2) },
        { completedDate: subDays(today, 3) },
      ];

      mockHabitCompletionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(completions),
        }),
      });

      const result = await service.calculateStreak(habitId, 'daily', []);
      expect(result.currentStreak).toBe(1);
    });

    it('should count only scheduled days for custom frequency [1,3,5] (Mon,Wed,Fri)', async () => {
      // For a Mon/Wed/Fri habit, consecutive completions should build a streak
      // Build actual Mon, Wed, Fri dates from the most recent week
      const today = startOfDay(new Date());
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
      const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastMonday = subDays(today, daysToLastMonday);
      const lastWednesday = new Date(lastMonday);
      lastWednesday.setDate(lastMonday.getDate() + 2);
      const lastFriday = new Date(lastMonday);
      lastFriday.setDate(lastMonday.getDate() + 4);

      // Include all 3 scheduled days this week that have passed
      const completions: { completedDate: Date }[] = [];
      if (lastFriday <= today)
        completions.push({ completedDate: startOfDay(lastFriday) });
      if (startOfDay(lastWednesday) <= today)
        completions.push({ completedDate: startOfDay(lastWednesday) });
      if (lastMonday <= today)
        completions.push({ completedDate: startOfDay(lastMonday) });

      // Ensure we have at least 1 completion
      if (completions.length === 0) {
        // Fallback: add Monday directly
        completions.push({ completedDate: lastMonday });
      }

      mockHabitCompletionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(completions),
        }),
      });

      // Custom with Mon, Wed, Fri (days 1, 3, 5) - all past scheduled days have completions
      const result = await service.calculateStreak(
        habitId,
        'custom',
        [1, 3, 5],
      );
      expect(result.currentStreak).toBeGreaterThan(0);
    });

    it('should skip non-scheduled days for HAB-10 custom frequency streak', async () => {
      // Monday-only habit: if we completed Mon last week and Mon this week,
      // the Tuesday-Sunday between don't break the streak
      const today = startOfDay(new Date());
      const dayOfWeek = today.getDay();
      const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastMonday = subDays(today, daysToLastMonday);
      const prevMonday = subDays(lastMonday, 7);

      const completions = [
        { completedDate: lastMonday },
        { completedDate: prevMonday },
      ];

      mockHabitCompletionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(completions),
        }),
      });

      // HAB-10: Mon-only habit (day 1), non-scheduled days Tue-Sun should NOT break streak
      const result = await service.calculateStreak(habitId, 'custom', [1]);
      expect(result.currentStreak).toBe(2); // Both Mondays count
    });

    it('should count consecutive weeks for weekly frequency', async () => {
      const today = startOfDay(new Date());
      // 3 completions over 3 different weeks
      const completions = [
        { completedDate: today },
        { completedDate: subDays(today, 7) },
        { completedDate: subDays(today, 14) },
      ];

      mockHabitCompletionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(completions),
        }),
      });

      const result = await service.calculateStreak(habitId, 'weekly', []);
      expect(result.currentStreak).toBe(3);
    });
  });
});
