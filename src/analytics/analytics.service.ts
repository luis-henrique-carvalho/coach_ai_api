import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  startOfDay,
  subDays,
  format,
  eachDayOfInterval,
  startOfYear,
  endOfYear,
  getDay,
} from 'date-fns';
import { Habit, HabitDocument } from '../habits/schemas/habit.schema';
import {
  HabitCompletion,
  HabitCompletionDocument,
} from '../habits/schemas/habit-completion.schema';
import { Goal, GoalDocument } from '../goals/schemas/goal.schema';
import { Subtask, SubtaskDocument } from '../goals/schemas/subtask.schema';

export interface StreakEntry {
  habitId: string;
  habitName: string;
  currentStreak: number;
}

export interface DashboardResult {
  habits: {
    total: number;
    completedToday: number;
    averageCompletionRate: number;
    longestActiveStreak: { habitName: string; days: number };
  };
  goals: {
    total: number;
    completed: number;
    averageProgress: number;
  };
  streaks: StreakEntry[];
  recentCompletions: HabitCompletionDocument[];
}

export interface TrendPoint {
  date: string;
  completions: number;
  total: number;
}

export interface HeatmapEntry {
  date: string;
  count: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Habit.name) private habitModel: Model<HabitDocument>,
    @InjectModel(HabitCompletion.name)
    private habitCompletionModel: Model<HabitCompletionDocument>,
    @InjectModel(Goal.name) private goalModel: Model<GoalDocument>,
    @InjectModel(Subtask.name) private subtaskModel: Model<SubtaskDocument>,
  ) {}

  /**
   * Normalize userId to string for cross-model comparisons.
   * The userId from JWT can come as ObjectId or string depending on context.
   */
  private toUserIdString(userId: string): string {
    return typeof userId === 'string'
      ? userId
      : (userId as { toString(): string }).toString();
  }

  /**
   * Normalize userId to ObjectId for MongoDB queries.
   */
  private toUserObjectId(userId: string): Types.ObjectId {
    const userIdStr = this.toUserIdString(userId);
    return new Types.ObjectId(userIdStr);
  }

  async getDashboard(userId: string): Promise<DashboardResult> {
    const today = startOfDay(new Date());
    const thirtyDaysAgo = subDays(today, 30);
    const tomorrowStart = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const userObjectId = this.toUserObjectId(userId);
    const userIdStr = this.toUserIdString(userId);

    // Recent completions (last 10)
    const recentCompletions = await this.habitCompletionModel
      .find({ userId: userObjectId })
      .sort({ completedDate: -1 })
      .limit(10)
      .populate('habitId')
      .exec();

    // Get all active habits for this user
    const activeHabits = await this.habitModel
      .find({ userId: userObjectId, isActive: true })
      .exec();

    const totalHabits = activeHabits.length;

    // Count completions today
    const completedToday = await this.habitCompletionModel.countDocuments({
      userId: userObjectId,
      completedDate: { $gte: today, $lt: tomorrowStart },
    });

    // Calculate averageCompletionRate over last 30 days + streaks
    let totalExpected = 0;
    let totalActual = 0;
    const streaks: StreakEntry[] = [];

    for (const habit of activeHabits) {
      const habitObjectId = habit._id;
      const habitIdStr = habitObjectId.toString();

      // Count completions in last 30 days for this habit
      const habitCompletions30d =
        await this.habitCompletionModel.countDocuments({
          habitId: habitObjectId,
          completedDate: { $gte: thirtyDaysAgo, $lt: tomorrowStart },
        });

      // Calculate expected based on frequency
      const expectedDays = this.calculateExpectedDays(
        30,
        habit.frequencyType,
        habit.frequencyDays,
        today,
      );

      totalExpected += expectedDays;
      totalActual += habitCompletions30d;

      // Calculate current streak
      const allCompletions = await this.habitCompletionModel
        .find({ habitId: habitObjectId })
        .sort({ completedDate: -1 })
        .exec();

      const currentStreak = this.calculateCurrentStreak(
        allCompletions,
        habit.frequencyType,
        habit.frequencyDays,
        today,
      );

      streaks.push({
        habitId: habitIdStr,
        habitName: habit.name,
        currentStreak,
      });
    }

    // Sort streaks descending by currentStreak
    streaks.sort((a, b) => b.currentStreak - a.currentStreak);

    const averageCompletionRate =
      totalExpected > 0
        ? Math.round((totalActual / totalExpected) * 100 * 10) / 10
        : 0;

    const longestActiveStreak =
      streaks.length > 0
        ? { habitName: streaks[0].habitName, days: streaks[0].currentStreak }
        : { habitName: '', days: 0 };

    // Goal stats
    const allGoals = await this.goalModel.find({ userId: userObjectId }).exec();

    const totalGoals = allGoals.length;
    const completedGoals = allGoals.filter((g) => g.isCompleted).length;

    let progressSum = 0;
    for (const goal of allGoals) {
      const goalObjectId = goal._id;
      const totalSubtasks = await this.subtaskModel.countDocuments({
        goalId: goalObjectId,
      });
      const completedSubtasks = await this.subtaskModel.countDocuments({
        goalId: goalObjectId,
        isCompleted: true,
      });
      if (totalSubtasks > 0) {
        progressSum += (completedSubtasks / totalSubtasks) * 100;
      } else if (goal.isCompleted) {
        progressSum += 100;
      }
    }

    const averageProgress =
      totalGoals > 0 ? Math.round((progressSum / totalGoals) * 10) / 10 : 0;

    // Suppress unused variable warning
    void userIdStr;

    return {
      habits: {
        total: totalHabits,
        completedToday,
        averageCompletionRate,
        longestActiveStreak,
      },
      goals: {
        total: totalGoals,
        completed: completedGoals,
        averageProgress,
      },
      streaks,
      recentCompletions,
    };
  }

  async getHabitTrends(userId: string, period?: string): Promise<TrendPoint[]> {
    const resolvedPeriod = period ?? '30d';
    const daysCount =
      resolvedPeriod === '7d' ? 7 : resolvedPeriod === '90d' ? 90 : 30;
    const today = startOfDay(new Date());
    const startDate = subDays(today, daysCount - 1);
    const tomorrowStart = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const userObjectId = this.toUserObjectId(userId);

    // Total active habits for "total" field
    const totalActiveHabits = await this.habitModel.countDocuments({
      userId: userObjectId,
      isActive: true,
    });

    // Aggregate completions by day for this user
    const aggregateResult = await this.habitCompletionModel.aggregate([
      {
        $match: {
          userId: userObjectId,
          completedDate: { $gte: startDate, $lt: tomorrowStart },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$completedDate' },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Build map from aggregation result
    const completionsMap = new Map<string, number>();
    for (const entry of aggregateResult as { _id: string; count: number }[]) {
      completionsMap.set(entry._id, entry.count);
    }

    // Generate all days in the period
    const dateRange = eachDayOfInterval({ start: startDate, end: today });
    return dateRange.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      return {
        date: dateStr,
        completions: completionsMap.get(dateStr) ?? 0,
        total: totalActiveHabits,
      };
    });
  }

  async getHeatmap(
    userId: string,
    habitId: string,
    year?: number,
  ): Promise<HeatmapEntry[]> {
    const resolvedYear = year ?? new Date().getFullYear();
    const yearStart = startOfYear(new Date(resolvedYear, 0, 1));
    const yearEnd = endOfYear(new Date(resolvedYear, 0, 1));

    const habitObjectId = new Types.ObjectId(habitId);
    const userObjectId = this.toUserObjectId(userId);

    const completions = await this.habitCompletionModel
      .find({
        habitId: habitObjectId,
        userId: userObjectId,
        completedDate: { $gte: yearStart, $lte: yearEnd },
      })
      .sort({ completedDate: 1 })
      .exec();

    return completions.map((c) => ({
      date: format(new Date(c.completedDate), 'yyyy-MM-dd'),
      count: 1,
    }));
  }

  private calculateExpectedDays(
    periodDays: number,
    frequencyType: string,
    frequencyDays: number[],
    today: Date,
  ): number {
    if (frequencyType === 'daily') {
      return periodDays;
    } else if (frequencyType === 'weekly') {
      return Math.round((periodDays / 7) * 4.33); // ~4 weeks per month
    } else {
      // custom — enumerate scheduled days in period
      const startDate = subDays(today, periodDays - 1);
      const allDays = eachDayOfInterval({ start: startDate, end: today });
      return allDays.filter((day) => frequencyDays.includes(getDay(day)))
        .length;
    }
  }

  private calculateCurrentStreak(
    completions: HabitCompletionDocument[],
    frequencyType: string,
    frequencyDays: number[],
    today: Date,
  ): number {
    if (completions.length === 0) return 0;

    if (frequencyType === 'daily') {
      const mostRecent = startOfDay(new Date(completions[0].completedDate));
      const daysDiff = Math.round(
        (today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysDiff > 1) return 0;

      let streak = 0;
      let expected = mostRecent;
      for (const c of completions) {
        const d = startOfDay(new Date(c.completedDate));
        if (d.getTime() === expected.getTime()) {
          streak++;
          expected = subDays(expected, 1);
        } else {
          break;
        }
      }
      return streak;
    } else if (frequencyType === 'weekly') {
      // Simplified — count consecutive weeks
      const weekMap = new Set<string>();
      for (const c of completions) {
        const d = new Date(c.completedDate);
        const weekStart = startOfDay(
          subDays(d, d.getDay() === 0 ? 6 : d.getDay() - 1),
        );
        weekMap.add(format(weekStart, 'yyyy-MM-dd'));
      }
      const weeks = Array.from(weekMap).sort().reverse();
      let streak = 0;
      const currentWeekStart = startOfDay(
        subDays(today, today.getDay() === 0 ? 6 : today.getDay() - 1),
      );
      let expectedWeek = format(currentWeekStart, 'yyyy-MM-dd');
      for (const week of weeks) {
        if (week === expectedWeek) {
          streak++;
          const d = new Date(expectedWeek);
          const prev = subDays(d, 7);
          expectedWeek = format(prev, 'yyyy-MM-dd');
        } else {
          break;
        }
      }
      return streak;
    } else {
      // Custom frequency
      if (frequencyDays.length === 0) return 0;
      const completionSet = new Set(
        completions.map((c) => startOfDay(new Date(c.completedDate)).getTime()),
      );
      const oldestCompletion = Math.min(...Array.from(completionSet));
      const limitDate = oldestCompletion - 8 * 24 * 60 * 60 * 1000;

      const scheduledDays: Date[] = [];
      let cursor = today;
      while (cursor.getTime() >= limitDate) {
        if (frequencyDays.includes(getDay(cursor))) {
          scheduledDays.push(new Date(cursor));
        }
        cursor = subDays(cursor, 1);
      }

      let streak = 0;
      for (const day of scheduledDays) {
        if (completionSet.has(day.getTime())) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    }
  }
}
