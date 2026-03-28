import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HabitDocument = Habit & Document;

@Schema({ timestamps: true })
export class Habit {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({
    required: true,
    enum: ['daily', 'weekly', 'custom'],
    default: 'daily',
  })
  frequencyType!: 'daily' | 'weekly' | 'custom';

  @Prop({ type: [Number], default: [] })
  frequencyDays!: number[];

  @Prop({ default: true })
  isActive!: boolean;
}

export const HabitSchema = SchemaFactory.createForClass(Habit);
