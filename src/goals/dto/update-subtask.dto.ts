import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateSubtaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
