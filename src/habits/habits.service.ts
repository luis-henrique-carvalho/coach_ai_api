import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  startOfDay,
  subDays,
  getDay,
  startOfWeek,
  differenceInCalendarWeeks,
} from 'date-fns';
import { Habit, HabitDocument } from './schemas/habit.schema';
import {
  HabitCompletion,
  HabitCompletionDocument,
} from './schemas/habit-completion.schema';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

export interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  totalCompletions: number;
}

export interface HabitWithStats extends HabitDocument {
  currentStreak: number;
  bestStreak: number;
  totalCompletions: number;
  isCompletedToday: boolean;
}

interface MongoError extends Error {
  code?: number;
}

@Injectable()
export class HabitsService {
  constructor(
    @InjectModel(Habit.name) private habitModel: Model<HabitDocument>,
    @InjectModel(HabitCompletion.name)
    private habitCompletionModel: Model<HabitCompletionDocument>,
  ) {}

  async create(
    userId: string,
    createHabitDto: CreateHabitDto,
  ): Promise<HabitDocument> {
    return this.habitModel.create({
      userId,
      ...createHabitDto,
    });
  }

  async findAllByUser(userId: string): Promise<HabitWithStats[]> {
    const habits = await this.habitModel
      .find({ userId, isActive: true })
      .exec();

    return Promise.all(habits.map((habit) => this.getHabitStats(habit)));
  }

  async findOne(id: string, userId: string): Promise<HabitWithStats> {
    const habit = await this.habitModel.findOne({ _id: id, userId }).exec();
    if (!habit) {
      throw new NotFoundException(`Habit #${id} not found`);
    }
    return this.getHabitStats(habit);
  }

  async update(
    id: string,
    userId: string,
    updateHabitDto: UpdateHabitDto,
  ): Promise<HabitDocument> {
    const habit = await this.habitModel.findOne({ _id: id, userId }).exec();
    if (!habit) {
      throw new NotFoundException(`Habit #${id} not found`);
    }

    Object.assign(habit, updateHabitDto);
    return habit.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const habit = await this.habitModel.findOne({ _id: id, userId }).exec();
    if (!habit) {
      throw new NotFoundException(`Habit #${id} not found`);
    }

    await this.habitModel.findByIdAndDelete(id).exec();
    await this.habitCompletionModel.deleteMany({ habitId: id }).exec();
  }

  async complete(
    habitId: string,
    userId: string,
  ): Promise<HabitCompletionDocument> {
    const habit = await this.habitModel
      .findOne({ _id: habitId, userId })
      .exec();
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }

    const today = startOfDay(new Date());

    try {
      return await this.habitCompletionModel.create({
        habitId,
        userId,
        completedDate: today,
      });
    } catch (err: unknown) {
      const mongoErr = err as MongoError;
      if (mongoErr.code === 11000) {
        throw new ConflictException('Habit already completed today');
      }
      throw err;
    }
  }

  async uncomplete(habitId: string, userId: string): Promise<void> {
    const habit = await this.habitModel
      .findOne({ _id: habitId, userId })
      .exec();
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }

    const today = startOfDay(new Date());
    const completion = await this.habitCompletionModel
      .findOne({ habitId, completedDate: today })
      .exec();

    if (!completion) {
      throw new NotFoundException('No completion found for today');
    }

    await this.habitCompletionModel
      .deleteOne({ habitId, completedDate: today })
      .exec();
  }

  async getCompletionHistory(
    habitId: string,
    userId: string,
    limit = 30,
    offset = 0,
  ): Promise<HabitCompletionDocument[]> {
    const habit = await this.habitModel
      .findOne({ _id: habitId, userId })
      .exec();
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }

    return this.habitCompletionModel
      .find({ habitId })
      .sort({ completedDate: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }

  async calculateStreak(
    habitId: string,
    frequencyType: 'daily' | 'weekly' | 'custom',
    frequencyDays: number[],
  ): Promise<HabitStats> {
    const completions = await this.habitCompletionModel
      .find({ habitId })
      .sort({ completedDate: -1 })
      .exec();

    const totalCompletions = completions.length;

    if (totalCompletions === 0) {
      return { currentStreak: 0, bestStreak: 0, totalCompletions: 0 };
    }

    if (frequencyType === 'daily') {
      return this.calculateDailyStreak(completions, totalCompletions);
    } else if (frequencyType === 'weekly') {
      return this.calculateWeeklyStreak(completions, totalCompletions);
    } else {
      return this.calculateCustomStreak(
        completions,
        frequencyDays,
        totalCompletions,
      );
    }
  }

  private calculateDailyStreak(
    completions: HabitCompletionDocument[],
    totalCompletions: number,
  ): HabitStats {
    const today = startOfDay(new Date());
    const mostRecent = startOfDay(new Date(completions[0].completedDate));
    const daysDiff = Math.round(
      (today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysDiff > 1) {
      // Streak broken — current streak is 0
      return {
        currentStreak: 0,
        bestStreak: this.findBestDailyStreak(completions),
        totalCompletions,
      };
    }

    // Walk backwards from most recent completion counting consecutive days
    let currentStreak = 0;
    let expectedDate = mostRecent;

    for (const completion of completions) {
      const completionDate = startOfDay(new Date(completion.completedDate));
      if (completionDate.getTime() === expectedDate.getTime()) {
        currentStreak++;
        expectedDate = subDays(expectedDate, 1);
      } else {
        break;
      }
    }

    const bestStreak = this.findBestDailyStreak(completions);

    return {
      currentStreak,
      bestStreak: Math.max(currentStreak, bestStreak),
      totalCompletions,
    };
  }

  private findBestDailyStreak(completions: HabitCompletionDocument[]): number {
    if (completions.length === 0) return 0;
    let best = 1;
    let current = 1;
    for (let i = 1; i < completions.length; i++) {
      const prev = startOfDay(new Date(completions[i - 1].completedDate));
      const curr = startOfDay(new Date(completions[i].completedDate));
      const diff = Math.round(
        (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diff === 1) {
        current++;
        if (current > best) best = current;
      } else {
        current = 1;
      }
    }
    return best;
  }

  private calculateWeeklyStreak(
    completions: HabitCompletionDocument[],
    totalCompletions: number,
  ): HabitStats {
    const referenceDate = startOfWeek(new Date(), { weekStartsOn: 1 });

    // Group completions by week offset from reference
    const weekSet = new Set<number>();
    for (const completion of completions) {
      const weekDiff = differenceInCalendarWeeks(
        referenceDate,
        startOfWeek(new Date(completion.completedDate), { weekStartsOn: 1 }),
        { weekStartsOn: 1 },
      );
      weekSet.add(weekDiff);
    }

    const sortedWeeks = Array.from(weekSet).sort((a, b) => a - b);

    // Count current streak (consecutive weeks starting from week 0 or 1)
    let currentStreak = 0;
    if (sortedWeeks[0] <= 1) {
      let expectedWeek = sortedWeeks[0];
      for (const week of sortedWeeks) {
        if (week === expectedWeek) {
          currentStreak++;
          expectedWeek++;
        } else {
          break;
        }
      }
    }

    // Find best streak
    let bestStreak = currentStreak;
    let temp = 1;
    for (let i = 1; i < sortedWeeks.length; i++) {
      if (sortedWeeks[i] === sortedWeeks[i - 1] + 1) {
        temp++;
        if (temp > bestStreak) bestStreak = temp;
      } else {
        temp = 1;
      }
    }

    return { currentStreak, bestStreak, totalCompletions };
  }

  private calculateCustomStreak(
    completions: HabitCompletionDocument[],
    frequencyDays: number[],
    totalCompletions: number,
  ): HabitStats {
    if (frequencyDays.length === 0) {
      return { currentStreak: 0, bestStreak: 0, totalCompletions };
    }

    // Build a set of completion timestamps (normalized to start of day)
    const completionSet = new Set(
      completions.map((c) => startOfDay(new Date(c.completedDate)).getTime()),
    );

    if (completionSet.size === 0) {
      return { currentStreak: 0, bestStreak: 0, totalCompletions };
    }

    // Find the oldest completion to know how far back to scan
    const oldestCompletion = Math.min(...Array.from(completionSet));

    // Generate all scheduled days from today back to oldest completion (inclusive)
    const today = startOfDay(new Date());
    const scheduledDays: Date[] = [];
    let cursor = today;
    // Go back far enough to include all completions
    const limitDate = oldestCompletion - 8 * 24 * 60 * 60 * 1000;
    while (cursor.getTime() >= limitDate) {
      if (frequencyDays.includes(getDay(cursor))) {
        scheduledDays.push(new Date(cursor));
      }
      cursor = subDays(cursor, 1);
    }

    // scheduledDays is sorted most recent first
    // Count current streak: consecutive scheduled days (most recent first) with completions
    let currentStreak = 0;
    for (const day of scheduledDays) {
      if (completionSet.has(day.getTime())) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Find best streak across all history
    let bestStreak = currentStreak;
    let tempStreak = 0;
    for (const day of scheduledDays) {
      if (completionSet.has(day.getTime())) {
        tempStreak++;
        if (tempStreak > bestStreak) bestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    return { currentStreak, bestStreak, totalCompletions };
  }

  private async getHabitStats(habit: HabitDocument): Promise<HabitWithStats> {
    const habitIdStr = (habit._id as { toString(): string }).toString();

    const stats = await this.calculateStreak(
      habitIdStr,
      habit.frequencyType,
      habit.frequencyDays,
    );

    const today = startOfDay(new Date());
    const todayCompletion = await this.habitCompletionModel
      .findOne({
        habitId: habitIdStr,
        completedDate: today,
      })
      .exec();

    return {
      ...('toObject' in habit && typeof habit.toObject === 'function'
        ? habit.toObject()
        : habit),
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      totalCompletions: stats.totalCompletions,
      isCompletedToday: !!todayCompletion,
    } as HabitWithStats;
  }
}
