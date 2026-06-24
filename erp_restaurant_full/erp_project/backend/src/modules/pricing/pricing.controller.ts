import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.PROCUREMENT)
@Controller('pricing')
export class PricingController {
  constructor(private svc: PricingService) {}

  @Post('bulk-update')
  bulkUpdate(@Body() dto: any, @CurrentUser('sub') userId: number) {
    return this.svc.bulkUpdate(dto, userId);
  }
}
