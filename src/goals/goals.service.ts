import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Goal, GoalDocument } from './schemas/goal.schema';
import { Subtask, SubtaskDocument } from './schemas/subtask.schema';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

export interface GoalProgress {
  total: number;
  completed: number;
  percentage: number;
}

export interface GoalWithProgress {
  goal: GoalDocument;
  progress: GoalProgress;
}

export interface SubtaskWithChildren {
  children: SubtaskDocument[];
  [key: string]: unknown;
}

@Injectable()
export class GoalsService {
  constructor(
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(Subtask.name) private subtaskModel: Model<SubtaskDocument>,
  ) {}

  async createGoal(userId: string, dto: CreateGoalDto): Promise<GoalDocument> {
    return this.goalModel.create({
      userId,
      name: dto.name,
      description: dto.description,
    });
  }

  async findAllByUser(userId: string): Promise<GoalWithProgress[]> {
    const goals = await this.goalModel.find({ userId }).exec();

    const results: GoalWithProgress[] = [];
    for (const goal of goals) {
      const progress = await this.calculateProgress(goal._id.toString());
      results.push({ goal, progress });
    }
    return results;
  }

  async findOne(
    id: string,
    userId: string,
  ): Promise<{ goal: GoalDocument; subtasks: SubtaskWithChildren[] }> {
    const goal = await this.goalModel.findOne({ _id: id, userId }).exec();

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    // Fetch all subtasks for this goal
    const allSubtasks = await this.subtaskModel
      .find({ goalId: id })
      .sort({ order: 1 })
      .exec();

    // Build tree: top-level subtasks with children
    const topLevel = allSubtasks.filter(
      (s) => s.parentId === null || s.parentId === undefined,
    );
    const subtasks: SubtaskWithChildren[] = topLevel.map((parent) => {
      const children = allSubtasks.filter(
        (s) => s.parentId && s.parentId.toString() === parent._id.toString(),
      );
      const obj = parent.toObject() as unknown as Record<string, unknown>;
      return { ...obj, children };
    });

    return { goal, subtasks };
  }

  async updateGoal(
    id: string,
    userId: string,
    dto: UpdateGoalDto,
  ): Promise<GoalDocument> {
    const existing = await this.goalModel.findOne({ _id: id, userId }).exec();
    if (!existing) {
      throw new NotFoundException('Goal not found');
    }

    const updated = await this.goalModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('Goal not found');
    }
    return updated;
  }

  async removeGoal(id: string, userId: string): Promise<void> {
    const existing = await this.goalModel.findOne({ _id: id, userId }).exec();
    if (!existing) {
      throw new NotFoundException('Goal not found');
    }

    // Cascade delete all subtasks for this goal
    await this.subtaskModel.deleteMany({ goalId: id }).exec();

    await this.goalModel.findByIdAndDelete(id).exec();
  }

  async addSubtask(
    goalId: string,
    userId: string,
    dto: CreateSubtaskDto,
  ): Promise<SubtaskDocument> {
    const goal = await this.goalModel.findOne({ _id: goalId, userId }).exec();
    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    let parentId: Types.ObjectId | null = null;

    if (dto.parentId) {
      // Validate parent exists and belongs to this goal
      const parent = await this.subtaskModel
        .findOne({ _id: dto.parentId, goalId })
        .exec();

      if (!parent) {
        throw new NotFoundException('Parent subtask not found');
      }

      // Enforce 2-level max: parent must not have its own parentId
      if (parent.parentId !== null && parent.parentId !== undefined) {
        throw new BadRequestException('Maximum nesting depth is 2 levels');
      }

      parentId = new Types.ObjectId(dto.parentId);
    }

    return this.subtaskModel.create({
      goalId,
      userId,
      parentId,
      name: dto.name,
    });
  }

  async updateSubtask(
    goalId: string,
    subtaskId: string,
    userId: string,
    dto: UpdateSubtaskDto,
  ): Promise<SubtaskDocument> {
    const subtask = await this.subtaskModel
      .findOne({ _id: subtaskId, goalId, userId })
      .exec();

    if (!subtask) {
      throw new NotFoundException('Subtask not found');
    }

    const updated = await this.subtaskModel
      .findByIdAndUpdate(subtaskId, dto, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('Subtask not found');
    }
    return updated;
  }

  async removeSubtask(
    goalId: string,
    subtaskId: string,
    userId: string,
  ): Promise<void> {
    const subtask = await this.subtaskModel
      .findOne({ _id: subtaskId, goalId, userId })
      .exec();

    if (!subtask) {
      throw new NotFoundException('Subtask not found');
    }

    // Delete the subtask itself
    await this.subtaskModel.findByIdAndDelete(subtaskId).exec();

    // Cascade: delete all child subtasks
    await this.subtaskModel.deleteMany({ parentId: subtaskId }).exec();
  }

  async toggleSubtask(
    goalId: string,
    subtaskId: string,
    userId: string,
  ): Promise<SubtaskDocument> {
    const subtask = await this.subtaskModel
      .findOne({ _id: subtaskId, goalId, userId })
      .exec();

    if (!subtask) {
      throw new NotFoundException('Subtask not found');
    }

    subtask.isCompleted = !subtask.isCompleted;
    return subtask.save();
  }

  async calculateProgress(goalId: string): Promise<GoalProgress> {
    const total = await this.subtaskModel.countDocuments({ goalId });
    const completed = await this.subtaskModel.countDocuments({
      goalId,
      isCompleted: true,
    });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, percentage };
  }
}
