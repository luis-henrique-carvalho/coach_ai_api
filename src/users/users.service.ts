import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

export interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
}

interface ProviderQuery {
  [key: string]: string;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findOrCreateByOAuth(profile: OAuthProfile): Promise<UserDocument> {
    const { provider, providerId, email, name, avatar } = profile;

    // First, try to find user by provider ID
    const providerQuery: ProviderQuery = {};
    providerQuery[`providers.${provider}.id`] = providerId;

    let user = await this.userModel.findOne(providerQuery).exec();

    if (user) {
      return user;
    }

    // If not found by provider ID, try to find by email
    if (email) {
      user = await this.userModel.findOne({ email }).exec();

      if (user) {
        // Link the new provider to existing user
        (user.providers as Record<string, { id: string }>)[provider] = {
          id: providerId,
        };
        await user.save();
        return user;
      }
    }

    // Create new user
    const newUser = await this.userModel.create({
      email,
      name,
      avatar,
      providers: {
        [provider]: { id: providerId },
      },
    });

    return newUser;
  }
}
