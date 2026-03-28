import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HabitsService } from './habits.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

export interface HabitRequest extends ExpressRequest {
  user?: {
    _id: string;
    email: string;
    name: string;
    avatar: string;
  };
}

@Controller('habits')
@UseGuards(JwtAuthGuard)
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  @Post()
  @HttpCode(201)
  create(@Request() req: HabitRequest, @Body() createHabitDto: CreateHabitDto) {
    const userId = req.user!._id;
    return this.habitsService.create(userId, createHabitDto);
  }

  @Get()
  findAll(@Request() req: HabitRequest) {
    const userId = req.user!._id;
    return this.habitsService.findAllByUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: HabitRequest) {
    const userId = req.user!._id;
    return this.habitsService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: HabitRequest,
    @Body() updateHabitDto: UpdateHabitDto,
  ) {
    const userId = req.user!._id;
    return this.habitsService.update(id, userId, updateHabitDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: HabitRequest) {
    const userId = req.user!._id;
    return this.habitsService.remove(id, userId);
  }

  @Post(':id/complete')
  @HttpCode(201)
  complete(@Param('id') id: string, @Request() req: HabitRequest) {
    const userId = req.user!._id;
    return this.habitsService.complete(id, userId);
  }

  @Delete(':id/complete')
  uncomplete(@Param('id') id: string, @Request() req: HabitRequest) {
    const userId = req.user!._id;
    return this.habitsService.uncomplete(id, userId);
  }

  @Get(':id/completions')
  getCompletions(
    @Param('id') id: string,
    @Request() req: HabitRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = req.user!._id;
    const parsedLimit = limit ? parseInt(limit, 10) : 30;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.habitsService.getCompletionHistory(
      id,
      userId,
      parsedLimit,
      parsedOffset,
    );
  }
}
