import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateHabitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(['daily', 'weekly', 'custom'])
  frequencyType!: 'daily' | 'weekly' | 'custom';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  frequencyDays?: number[];
}
