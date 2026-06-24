import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsString, IsNotEmpty } from 'class-validator';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

export class ResetSystemDto {
  @IsString() @IsNotEmpty() confirmPhrase: string;
  @IsBoolean() keepMasterData: boolean;
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private svc: AdminService) {}

  @Get('stats')
  getStats() {
    return this.svc.getSystemStats();
  }

  @Post('reset')
  reset(@Request() req: any, @Body() body: ResetSystemDto) {
    // JWT strategy returns { sub, email, role, branchId, branchIds } — use sub not id
    return this.svc.resetSystem(req.user.sub, body.confirmPhrase, body.keepMasterData);
  }

  /**
   * Delete any individual record by type + id.
   * SUPER_ADMIN only. Handles FK-safe deletion for each entity type.
   */
  @Delete('records/:type/:id')
  deleteRecord(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.svc.deleteRecord(type, id, req.user.sub);
  }
}
