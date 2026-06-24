import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReplenishmentService } from './replenishment.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Replenishment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('replenishment')
export class ReplenishmentController {
  constructor(private svc: ReplenishmentService) {}

  @Get('suggestions') @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.PROCUREMENT, Role.WAREHOUSE)
  suggestions(
    @Query('branchId', ParseIntPipe) branchId: number,
    @Query('coverDays') coverDays?: string,
    @Query('lookbackDays') lookbackDays?: string,
  ) {
    return this.svc.suggestions(
      branchId,
      coverDays ? parseInt(coverDays, 10) : undefined,
      lookbackDays ? parseInt(lookbackDays, 10) : undefined,
    );
  }
}
