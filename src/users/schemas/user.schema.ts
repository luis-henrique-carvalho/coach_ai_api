import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  avatar?: string;

  @Prop({ type: Object, default: {} })
  providers!: {
    google?: {
      id: string;
    };
    github?: {
      id: string;
    };
  };

  @Prop()
  createdAt!: Date;

  @Prop()
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Create indexes for OAuth provider IDs
UserSchema.index({ 'providers.google.id': 1 });
UserSchema.index({ 'providers.github.id': 1 });
