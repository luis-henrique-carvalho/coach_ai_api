import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { TrendsQueryDto } from './dto/trends-query.dto';
import { HeatmapQueryDto } from './dto/heatmap-query.dto';

export interface AnalyticsRequest extends ExpressRequest {
  user?: {
    _id: string;
    email: string;
    name: string;
    avatar: string;
  };
}

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboard(@Request() req: AnalyticsRequest) {
    const userId = req.user!._id;
    return this.analyticsService.getDashboard(userId);
  }

  @Get('habits/trends')
  getHabitTrends(
    @Request() req: AnalyticsRequest,
    @Query() query: TrendsQueryDto,
  ) {
    const userId = req.user!._id;
    return this.analyticsService.getHabitTrends(userId, query.period);
  }

  @Get('habits/:id/heatmap')
  getHeatmap(
    @Request() req: AnalyticsRequest,
    @Param('id') id: string,
    @Query() query: HeatmapQueryDto,
  ) {
    const userId = req.user!._id;
    return this.analyticsService.getHeatmap(userId, id, query.year);
  }
}
