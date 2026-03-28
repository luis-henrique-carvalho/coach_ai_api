import { UserDocument } from '../../users/schemas/user.schema';

export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  avatar?: string;

  constructor(user: UserDocument) {
    this.id = typeof user._id === 'string' ? user._id : String(user._id);
    this.email = user.email;
    this.name = user.name;
    this.avatar = user.avatar;
  }
}
