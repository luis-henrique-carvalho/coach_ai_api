import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { GoalsService } from './goals.service';
import { Goal } from './schemas/goal.schema';
import { Subtask } from './schemas/subtask.schema';

const mockGoalId = new Types.ObjectId().toHexString();
const mockUserId = new Types.ObjectId().toHexString();
const mockSubtaskId = new Types.ObjectId().toHexString();
const mockParentSubtaskId = new Types.ObjectId().toHexString();

const mockGoal = {
  _id: mockGoalId,
  userId: mockUserId,
  name: 'Learn TypeScript',
  description: 'Master TypeScript deeply',
  isCompleted: false,
  save: jest.fn(),
};

const mockSubtask = {
  _id: mockSubtaskId,
  goalId: mockGoalId,
  userId: mockUserId,
  parentId: null,
  name: 'Read the docs',
  isCompleted: false,
  order: 0,
  save: jest.fn(),
};

const createMockModel = () => {
  const mockModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    countDocuments: jest.fn(),
  };
  return mockModel;
};

describe('GoalsService', () => {
  let service: GoalsService;
  let goalModel: ReturnType<typeof createMockModel>;
  let subtaskModel: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    goalModel = createMockModel();
    subtaskModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        {
          provide: getModelToken(Goal.name),
          useValue: goalModel,
        },
        {
          provide: getModelToken(Subtask.name),
          useValue: subtaskModel,
        },
      ],
    }).compile();

    service = module.get<GoalsService>(GoalsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Test 1: createGoal creates goal with userId
  describe('createGoal', () => {
    it('should create a goal with userId', async () => {
      goalModel.create.mockResolvedValue(mockGoal);

      const result = await service.createGoal(mockUserId, {
        name: 'Learn TypeScript',
        description: 'Master TypeScript deeply',
      });

      expect(goalModel.create).toHaveBeenCalledWith({
        userId: mockUserId,
        name: 'Learn TypeScript',
        description: 'Master TypeScript deeply',
      });
      expect(result).toEqual(mockGoal);
    });
  });

  // Test 2: findAllByUser returns goals with progress stats
  describe('findAllByUser', () => {
    it('should return goals with progress statistics', async () => {
      const goals = [
        { ...mockGoal, _id: mockGoalId },
      ];
      goalModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(goals),
      });
      subtaskModel.countDocuments
        .mockResolvedValueOnce(3) // total
        .mockResolvedValueOnce(2); // completed

      const result = await service.findAllByUser(mockUserId);

      expect(goalModel.find).toHaveBeenCalledWith({ userId: mockUserId });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        goal: expect.objectContaining({ name: 'Learn TypeScript' }),
        progress: {
          total: 3,
          completed: 2,
          percentage: 67,
        },
      });
    });
  });

  // Test 3: updateGoal updates existing goal
  describe('updateGoal', () => {
    it('should update an existing goal', async () => {
      const updatedGoal = { ...mockGoal, name: 'Learn TypeScript Advanced' };
      goalModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockGoal),
      });
      goalModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedGoal),
      });

      const result = await service.updateGoal(mockGoalId, mockUserId, {
        name: 'Learn TypeScript Advanced',
      });

      expect(result).toMatchObject({ name: 'Learn TypeScript Advanced' });
    });

    // Test 4: updateGoal throws NotFoundException for wrong user
    it('should throw NotFoundException when goal not found for user', async () => {
      goalModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.updateGoal(mockGoalId, 'wrong-user-id', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // Test 5: removeGoal deletes goal and cascades subtasks
  describe('removeGoal', () => {
    it('should delete goal and cascade delete all subtasks', async () => {
      goalModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockGoal),
      });
      goalModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockGoal),
      });
      subtaskModel.deleteMany.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 3 }),
      });

      await service.removeGoal(mockGoalId, mockUserId);

      expect(subtaskModel.deleteMany).toHaveBeenCalledWith({ goalId: mockGoalId });
      expect(goalModel.findByIdAndDelete).toHaveBeenCalledWith(mockGoalId);
    });
  });

  // Test 6: addSubtask creates top-level subtask (parentId=null)
  describe('addSubtask', () => {
    it('should create a top-level subtask when no parentId provided', async () => {
      goalModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockGoal),
      });
      subtaskModel.create.mockResolvedValue(mockSubtask);

      const result = await service.addSubtask(mockGoalId, mockUserId, {
        name: 'Read the docs',
      });

      expect(subtaskModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          goalId: mockGoalId,
          userId: mockUserId,
          parentId: null,
          name: 'Read the docs',
        }),
      );
      expect(result).toEqual(mockSubtask);
    });

    // Test 7: addSubtask creates sub-subtask with valid parentId
    it('should create a sub-subtask when valid parentId provided', async () => {
      const parentSubtask = { ...mockSubtask, _id: mockParentSubtaskId, parentId: null };
      const subSubtask = { ...mockSubtask, _id: new Types.ObjectId().toHexString(), parentId: mockParentSubtaskId };

      goalModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockGoal),
      });
      subtaskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(parentSubtask),
      });
      subtaskModel.create.mockResolvedValue(subSubtask);

      const result = await service.addSubtask(mockGoalId, mockUserId, {
        name: 'Watch intro video',
        parentId: mockParentSubtaskId,
      });

      expect(subtaskModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Watch intro video',
          goalId: mockGoalId,
          userId: mockUserId,
        }),
      );
      expect(result).toMatchObject({ parentId: mockParentSubtaskId });
    });

    // Test 8: addSubtask throws BadRequestException when nesting beyond 2 levels
    it('should throw BadRequestException when trying to nest beyond 2 levels', async () => {
      // parentSubtask already has a parentId (meaning it is itself a sub-subtask)
      const deepSubtask = {
        ...mockSubtask,
        _id: mockParentSubtaskId,
        parentId: new Types.ObjectId(), // non-null means it's already a sub-subtask
      };

      goalModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockGoal),
      });
      subtaskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(deepSubtask),
      });

      await expect(
        service.addSubtask(mockGoalId, mockUserId, {
          name: 'Too deep subtask',
          parentId: mockParentSubtaskId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // Test 9: toggleSubtask toggles isCompleted true<->false
  describe('toggleSubtask', () => {
    it('should toggle isCompleted from false to true', async () => {
      const subtaskDoc = {
        ...mockSubtask,
        isCompleted: false,
        save: jest.fn().mockResolvedValue({ ...mockSubtask, isCompleted: true }),
      };
      subtaskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(subtaskDoc),
      });

      const result = await service.toggleSubtask(mockGoalId, mockSubtaskId, mockUserId);

      expect(subtaskDoc.isCompleted).toBe(true);
      expect(subtaskDoc.save).toHaveBeenCalled();
    });

    it('should toggle isCompleted from true to false', async () => {
      const subtaskDoc = {
        ...mockSubtask,
        isCompleted: true,
        save: jest.fn().mockResolvedValue({ ...mockSubtask, isCompleted: false }),
      };
      subtaskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(subtaskDoc),
      });

      await service.toggleSubtask(mockGoalId, mockSubtaskId, mockUserId);

      expect(subtaskDoc.isCompleted).toBe(false);
      expect(subtaskDoc.save).toHaveBeenCalled();
    });
  });

  // Test 10: removeSubtask cascades to child subtasks
  describe('removeSubtask', () => {
    it('should delete subtask and cascade delete its children', async () => {
      subtaskModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSubtask),
      });
      subtaskModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSubtask),
      });
      subtaskModel.deleteMany.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 2 }),
      });

      await service.removeSubtask(mockGoalId, mockSubtaskId, mockUserId);

      expect(subtaskModel.findByIdAndDelete).toHaveBeenCalledWith(mockSubtaskId);
      expect(subtaskModel.deleteMany).toHaveBeenCalledWith({ parentId: mockSubtaskId });
    });
  });

  // Test 11: calculateProgress returns correct percentages
  describe('calculateProgress', () => {
    it('should return 67% when 2 of 3 subtasks are completed', async () => {
      subtaskModel.countDocuments
        .mockResolvedValueOnce(3) // total
        .mockResolvedValueOnce(2); // completed

      const result = await service.calculateProgress(mockGoalId);

      expect(result).toEqual({
        total: 3,
        completed: 2,
        percentage: 67,
      });
    });

    // Test 12: calculateProgress returns 0 when no subtasks
    it('should return 0% when there are no subtasks', async () => {
      subtaskModel.countDocuments
        .mockResolvedValueOnce(0) // total
        .mockResolvedValueOnce(0); // completed

      const result = await service.calculateProgress(mockGoalId);

      expect(result).toEqual({
        total: 0,
        completed: 0,
        percentage: 0,
      });
    });
  });
});
