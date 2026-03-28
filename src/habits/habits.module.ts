import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HabitsController } from './habits.controller';
import { HabitsService } from './habits.service';
import { Habit, HabitSchema } from './schemas/habit.schema';
import {
  HabitCompletion,
  HabitCompletionSchema,
} from './schemas/habit-completion.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Habit.name, schema: HabitSchema },
      { name: HabitCompletion.name, schema: HabitCompletionSchema },
    ]),
  ],
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
export class HabitsModule {}
