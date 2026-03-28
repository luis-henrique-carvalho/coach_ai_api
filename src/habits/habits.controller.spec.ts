import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { HabitsController, HabitRequest } from './habits.controller';
import { HabitsService } from './habits.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

describe('HabitsController', () => {
  let controller: HabitsController;

  const userId = '507f1f77bcf86cd799439011';
  const habitId = '507f1f77bcf86cd799439012';

  const mockRequest = {
    user: {
      _id: userId,
      email: 'test@example.com',
      name: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
    },
  } as HabitRequest;

  const mockHabit = {
    _id: habitId,
    userId,
    name: 'Morning Run',
    frequencyType: 'daily',
    frequencyDays: [],
    currentStreak: 3,
    bestStreak: 5,
    totalCompletions: 10,
    isCompletedToday: false,
  };

  const mockHabitsService = {
    create: jest.fn(),
    findAllByUser: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    complete: jest.fn(),
    uncomplete: jest.fn(),
    getCompletionHistory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HabitsController],
      providers: [
        {
          provide: HabitsService,
          useValue: mockHabitsService,
        },
      ],
    }).compile();

    controller = module.get<HabitsController>(HabitsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    it('should call habitsService.create with userId and dto', async () => {
      const createDto: CreateHabitDto = {
        name: 'Morning Run',
        frequencyType: 'daily',
      };

      mockHabitsService.create.mockResolvedValue(mockHabit);

      const result = await controller.create(mockRequest, createDto);

      expect(mockHabitsService.create).toHaveBeenCalledWith(userId, createDto);
      expect(result).toEqual(mockHabit);
    });
  });

  describe('findAll()', () => {
    it('should return all habits for user with streak stats', async () => {
      mockHabitsService.findAllByUser.mockResolvedValue([mockHabit]);

      const result = await controller.findAll(mockRequest);

      expect(mockHabitsService.findAllByUser).toHaveBeenCalledWith(userId);
      expect(result).toEqual([mockHabit]);
    });
  });

  describe('findOne()', () => {
    it('should return a single habit with streak stats', async () => {
      mockHabitsService.findOne.mockResolvedValue(mockHabit);

      const result = await controller.findOne(habitId, mockRequest);

      expect(mockHabitsService.findOne).toHaveBeenCalledWith(habitId, userId);
      expect(result).toEqual(mockHabit);
    });

    it('should propagate NotFoundException from service', async () => {
      mockHabitsService.findOne.mockRejectedValue(
        new NotFoundException('Habit not found'),
      );

      await expect(
        controller.findOne('nonexistent', mockRequest),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('should call habitsService.update with correct params', async () => {
      const updateDto: UpdateHabitDto = { name: 'Evening Run' };
      const updatedHabit = { ...mockHabit, name: 'Evening Run' };

      mockHabitsService.update.mockResolvedValue(updatedHabit);

      const result = await controller.update(habitId, mockRequest, updateDto);

      expect(mockHabitsService.update).toHaveBeenCalledWith(
        habitId,
        userId,
        updateDto,
      );
      expect(result).toEqual(updatedHabit);
    });

    it('should propagate NotFoundException for missing habit', async () => {
      mockHabitsService.update.mockRejectedValue(
        new NotFoundException('Habit not found'),
      );

      await expect(
        controller.update('nonexistent', mockRequest, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('should call habitsService.remove with correct params', async () => {
      mockHabitsService.remove.mockResolvedValue(undefined);

      await controller.remove(habitId, mockRequest);

      expect(mockHabitsService.remove).toHaveBeenCalledWith(habitId, userId);
    });
  });

  describe('complete()', () => {
    it('should call habitsService.complete and return completion', async () => {
      const mockCompletion = { habitId, userId, completedDate: new Date() };
      mockHabitsService.complete.mockResolvedValue(mockCompletion);

      const result = await controller.complete(habitId, mockRequest);

      expect(mockHabitsService.complete).toHaveBeenCalledWith(habitId, userId);
      expect(result).toEqual(mockCompletion);
    });

    it('should propagate ConflictException for double completion', async () => {
      mockHabitsService.complete.mockRejectedValue(
        new ConflictException('Already completed today'),
      );

      await expect(controller.complete(habitId, mockRequest)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('uncomplete()', () => {
    it('should call habitsService.uncomplete with correct params', async () => {
      mockHabitsService.uncomplete.mockResolvedValue(undefined);

      await controller.uncomplete(habitId, mockRequest);

      expect(mockHabitsService.uncomplete).toHaveBeenCalledWith(
        habitId,
        userId,
      );
    });
  });

  describe('getCompletions()', () => {
    it('should call getCompletionHistory with parsed limit and offset', async () => {
      const mockCompletions = [{ habitId, userId, completedDate: new Date() }];
      mockHabitsService.getCompletionHistory.mockResolvedValue(mockCompletions);

      const result = await controller.getCompletions(
        habitId,
        mockRequest,
        '10',
        '5',
      );

      expect(mockHabitsService.getCompletionHistory).toHaveBeenCalledWith(
        habitId,
        userId,
        10,
        5,
      );
      expect(result).toEqual(mockCompletions);
    });

    it('should use default limit and offset when not provided', async () => {
      mockHabitsService.getCompletionHistory.mockResolvedValue([]);

      await controller.getCompletions(habitId, mockRequest);

      expect(mockHabitsService.getCompletionHistory).toHaveBeenCalledWith(
        habitId,
        userId,
        30,
        0,
      );
    });
  });
});
