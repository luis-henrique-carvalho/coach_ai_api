import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Habit, HabitSchema } from '../habits/schemas/habit.schema';
import {
  HabitCompletion,
  HabitCompletionSchema,
} from '../habits/schemas/habit-completion.schema';
import { Goal, GoalSchema } from '../goals/schemas/goal.schema';
import { Subtask, SubtaskSchema } from '../goals/schemas/subtask.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Habit.name, schema: HabitSchema },
      { name: HabitCompletion.name, schema: HabitCompletionSchema },
      { name: Goal.name, schema: GoalSchema },
      { name: Subtask.name, schema: SubtaskSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
