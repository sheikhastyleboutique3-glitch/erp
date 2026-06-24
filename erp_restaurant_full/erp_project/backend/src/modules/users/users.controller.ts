import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  findAll(@Query('branchId') branchId?: string, @Query('role') role?: Role) {
    return this.usersService.findAll(branchId ? +branchId : undefined, role);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: any, @CurrentUser('sub') actorId: number) { return this.usersService.create(dto, actorId); }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser('sub') actorId: number) {
    return this.usersService.update(id, dto, actorId);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') actorId: number) { return this.usersService.remove(id, actorId); }
}
