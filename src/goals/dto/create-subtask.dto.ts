import { IsString, IsNotEmpty, IsOptional, MaxLength, IsMongoId } from 'class-validator';

export class CreateSubtaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @IsMongoId()
  parentId?: string;
}
