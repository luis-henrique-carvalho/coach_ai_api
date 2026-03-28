import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

interface AuthenticatedRequest {
  user: {
    _id: string;
  };
}

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateGoalDto) {
    return this.goalsService.createGoal(req.user._id, dto);
  }

  @Get()
  findAll(@Request() req: AuthenticatedRequest) {
    return this.goalsService.findAllByUser(req.user._id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.goalsService.findOne(id, req.user._id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goalsService.updateGoal(id, req.user._id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.goalsService.removeGoal(id, req.user._id);
  }

  @Post(':id/subtasks')
  @HttpCode(HttpStatus.CREATED)
  addSubtask(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateSubtaskDto,
  ) {
    return this.goalsService.addSubtask(id, req.user._id, dto);
  }

  @Patch(':id/subtasks/:subtaskId')
  updateSubtask(
    @Param('id') id: string,
    @Param('subtaskId') subtaskId: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateSubtaskDto,
  ) {
    return this.goalsService.updateSubtask(id, subtaskId, req.user._id, dto);
  }

  @Delete(':id/subtasks/:subtaskId')
  removeSubtask(
    @Param('id') id: string,
    @Param('subtaskId') subtaskId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.goalsService.removeSubtask(id, subtaskId, req.user._id);
  }

  @Patch(':id/subtasks/:subtaskId/toggle')
  toggleSubtask(
    @Param('id') id: string,
    @Param('subtaskId') subtaskId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.goalsService.toggleSubtask(id, subtaskId, req.user._id);
  }
}
