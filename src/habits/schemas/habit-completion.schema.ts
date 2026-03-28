import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HabitCompletionDocument = HabitCompletion & Document;

@Schema({ timestamps: true })
export class HabitCompletion {
  @Prop({ type: Types.ObjectId, ref: 'Habit', required: true, index: true })
  habitId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  completedDate!: Date;
}

export const HabitCompletionSchema =
  SchemaFactory.createForClass(HabitCompletion);

// Compound unique index to prevent double-completions per habit per day
HabitCompletionSchema.index({ habitId: 1, completedDate: 1 }, { unique: true });
