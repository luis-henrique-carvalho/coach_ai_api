import { IsEnum, IsOptional } from 'class-validator';

export class TrendsQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d', '90d'], {
    message: 'period must be one of: 7d, 30d, 90d',
  })
  period?: string = '30d';
}
