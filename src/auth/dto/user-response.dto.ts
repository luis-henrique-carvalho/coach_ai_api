export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  avatar?: string;

  constructor(user: any) {
    this.id = user._id.toString();
    this.email = user.email;
    this.name = user.name;
    this.avatar = user.avatar;
  }
}
