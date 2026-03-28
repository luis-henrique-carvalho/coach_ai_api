import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubtaskDocument = Subtask & Document;

@Schema({ timestamps: true })
export class Subtask {
  @Prop({ type: Types.ObjectId, ref: 'Goal', required: true, index: true })
  goalId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Subtask', default: null })
  parentId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ default: false })
  isCompleted!: boolean;

  @Prop({ default: 0 })
  order!: number;

  @Prop()
  createdAt!: Date;

  @Prop()
  updatedAt!: Date;
}

export const SubtaskSchema = SchemaFactory.createForClass(Subtask);

// Compound index for efficient retrieval of subtasks in order
SubtaskSchema.index({ goalId: 1, parentId: 1, order: 1 });
