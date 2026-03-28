import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

const mockUserId = new Types.ObjectId().toHexString();
const mockGoalId = new Types.ObjectId().toHexString();
const mockSubtaskId = new Types.ObjectId().toHexString();

const mockRequest = {
  user: { _id: mockUserId },
};

const mockGoal = {
  _id: mockGoalId,
  userId: mockUserId,
  name: 'Learn TypeScript',
  description: 'Master TypeScript deeply',
  isCompleted: false,
};

const mockSubtask = {
  _id: mockSubtaskId,
  goalId: mockGoalId,
  userId: mockUserId,
  parentId: null,
  name: 'Read the docs',
  isCompleted: false,
  order: 0,
};

const mockGoalsService = {
  createGoal: jest.fn(),
  findAllByUser: jest.fn(),
  findOne: jest.fn(),
  updateGoal: jest.fn(),
  removeGoal: jest.fn(),
  addSubtask: jest.fn(),
  updateSubtask: jest.fn(),
  removeSubtask: jest.fn(),
  toggleSubtask: jest.fn(),
  calculateProgress: jest.fn(),
};

describe('GoalsController', () => {
  let controller: GoalsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoalsController],
      providers: [
        {
          provide: GoalsService,
          useValue: mockGoalsService,
        },
      ],
    }).compile();

    controller = module.get<GoalsController>(GoalsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a goal and return it', async () => {
      mockGoalsService.createGoal.mockResolvedValue(mockGoal);

      const result = await controller.create(mockRequest as never, {
        name: 'Learn TypeScript',
        description: 'Master TypeScript deeply',
      });

      expect(mockGoalsService.createGoal).toHaveBeenCalledWith(mockUserId, {
        name: 'Learn TypeScript',
        description: 'Master TypeScript deeply',
      });
      expect(result).toEqual(mockGoal);
    });
  });

  describe('findAll', () => {
    it('should return all goals with progress for the user', async () => {
      const goalsWithProgress = [
        {
          goal: mockGoal,
          progress: { total: 3, completed: 2, percentage: 67 },
        },
      ];
      mockGoalsService.findAllByUser.mockResolvedValue(goalsWithProgress);

      const result = await controller.findAll(mockRequest as never);

      expect(mockGoalsService.findAllByUser).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual(goalsWithProgress);
    });
  });

  describe('findOne', () => {
    it('should return goal with subtask tree', async () => {
      const goalWithSubtasks = {
        goal: mockGoal,
        subtasks: [{ ...mockSubtask, children: [] }],
      };
      mockGoalsService.findOne.mockResolvedValue(goalWithSubtasks);

      const result = await controller.findOne(mockGoalId, mockRequest as never);

      expect(mockGoalsService.findOne).toHaveBeenCalledWith(
        mockGoalId,
        mockUserId,
      );
      expect(result).toEqual(goalWithSubtasks);
    });

    it('should propagate NotFoundException', async () => {
      mockGoalsService.findOne.mockRejectedValue(
        new NotFoundException('Goal not found'),
      );

      await expect(
        controller.findOne('invalid-id', mockRequest as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update and return the goal', async () => {
      const updated = { ...mockGoal, name: 'Updated Goal' };
      mockGoalsService.updateGoal.mockResolvedValue(updated);

      const result = await controller.update(mockGoalId, mockRequest as never, {
        name: 'Updated Goal',
      });

      expect(mockGoalsService.updateGoal).toHaveBeenCalledWith(
        mockGoalId,
        mockUserId,
        { name: 'Updated Goal' },
      );
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should delete the goal', async () => {
      mockGoalsService.removeGoal.mockResolvedValue(undefined);

      await controller.remove(mockGoalId, mockRequest as never);

      expect(mockGoalsService.removeGoal).toHaveBeenCalledWith(
        mockGoalId,
        mockUserId,
      );
    });
  });

  describe('addSubtask', () => {
    it('should add a subtask to a goal', async () => {
      mockGoalsService.addSubtask.mockResolvedValue(mockSubtask);

      const result = await controller.addSubtask(
        mockGoalId,
        mockRequest as never,
        { name: 'Read the docs' },
      );

      expect(mockGoalsService.addSubtask).toHaveBeenCalledWith(
        mockGoalId,
        mockUserId,
        { name: 'Read the docs' },
      );
      expect(result).toEqual(mockSubtask);
    });

    it('should propagate BadRequestException for too-deep nesting', async () => {
      mockGoalsService.addSubtask.mockRejectedValue(
        new BadRequestException('Maximum nesting depth is 2 levels'),
      );

      await expect(
        controller.addSubtask(mockGoalId, mockRequest as never, {
          name: 'Too deep',
          parentId: mockSubtaskId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateSubtask', () => {
    it('should update a subtask', async () => {
      const updatedSubtask = { ...mockSubtask, isCompleted: true };
      mockGoalsService.updateSubtask.mockResolvedValue(updatedSubtask);

      const result = await controller.updateSubtask(
        mockGoalId,
        mockSubtaskId,
        mockRequest as never,
        { isCompleted: true },
      );

      expect(mockGoalsService.updateSubtask).toHaveBeenCalledWith(
        mockGoalId,
        mockSubtaskId,
        mockUserId,
        { isCompleted: true },
      );
      expect(result).toEqual(updatedSubtask);
    });
  });

  describe('removeSubtask', () => {
    it('should delete a subtask', async () => {
      mockGoalsService.removeSubtask.mockResolvedValue(undefined);

      await controller.removeSubtask(
        mockGoalId,
        mockSubtaskId,
        mockRequest as never,
      );

      expect(mockGoalsService.removeSubtask).toHaveBeenCalledWith(
        mockGoalId,
        mockSubtaskId,
        mockUserId,
      );
    });
  });

  describe('toggleSubtask', () => {
    it('should toggle subtask completion', async () => {
      const toggled = { ...mockSubtask, isCompleted: true };
      mockGoalsService.toggleSubtask.mockResolvedValue(toggled);

      const result = await controller.toggleSubtask(
        mockGoalId,
        mockSubtaskId,
        mockRequest as never,
      );

      expect(mockGoalsService.toggleSubtask).toHaveBeenCalledWith(
        mockGoalId,
        mockSubtaskId,
        mockUserId,
      );
      expect(result).toEqual(toggled);
    });
  });
});
