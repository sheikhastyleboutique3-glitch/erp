import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffTasksService } from './staff-tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Role,
  StaffTaskCategory,
  StaffTaskPriority,
  StaffTaskStatus,
} from '@prisma/client';

export class ChecklistItemDto {
  @IsString() @IsNotEmpty() label: string;
  @IsOptional() @IsBoolean() done?: boolean;
}

export class CreateStaffTaskDto {
  @IsInt() branchId: number;
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() titleAr?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(StaffTaskCategory) category?: StaffTaskCategory;
  @IsOptional() @IsEnum(StaffTaskPriority) priority?: StaffTaskPriority;
  @IsOptional() @IsInt() assignedToId?: number;
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
  @IsOptional() @IsString() recurrence?: string;
}

export class UpdateStaffTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() titleAr?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(StaffTaskCategory) category?: StaffTaskCategory;
  @IsOptional() @IsEnum(StaffTaskPriority) priority?: StaffTaskPriority;
  @IsOptional() @IsEnum(StaffTaskStatus) status?: StaffTaskStatus;
  @IsOptional() @IsInt() assignedToId?: number;
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
  @IsOptional() @IsString() recurrence?: string;
}

export class ToggleChecklistDto {
  @IsInt() index: number;
  @IsBoolean() done: boolean;
}

// Managers create/assign; ancillary staff (cleaners) update progress on their tasks.
const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER];
const UPDATE: Role[] = [Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.CLEANER, Role.WAREHOUSE];

@ApiTags('Staff Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff-tasks')
export class StaffTasksController {
  constructor(private svc: StaffTasksService) {}

  @Get()
  list(
    @Query('branchId') branchId?: string,
    @Query('status') status?: StaffTaskStatus,
    @Query('category') category?: StaffTaskCategory,
    @Query('assignedToId') assignedToId?: string,
  ) {
    return this.svc.list({
      branchId: branchId ? parseInt(branchId, 10) : undefined,
      status,
      category,
      assignedToId: assignedToId ? parseInt(assignedToId, 10) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post() @Roles(...MANAGE)
  create(@Body() dto: CreateStaffTaskDto, @CurrentUser('id') userId: number) {
    return this.svc.create(dto, userId);
  }

  @Patch(':id') @Roles(...UPDATE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStaffTaskDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/checklist') @Roles(...UPDATE)
  toggle(@Param('id', ParseIntPipe) id: number, @Body() dto: ToggleChecklistDto) {
    return this.svc.toggleChecklistItem(id, dto.index, dto.done);
  }

  @Delete(':id') @Roles(...MANAGE)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
