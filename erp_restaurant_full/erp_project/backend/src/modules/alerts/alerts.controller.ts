import { Controller, Get, Patch, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private svc: AlertsService) {}
  @Get() findAll(@Query('branchId') branchId?: string, @Query('isRead') isRead?: string) { return this.svc.findAll(branchId ? +branchId : undefined, isRead !== undefined ? isRead === 'true' : undefined); }
  @Patch(':id/read') markRead(@Param('id', ParseIntPipe) id: number) { return this.svc.markRead(id); }
  @Patch(':id/resolve') resolve(@Param('id', ParseIntPipe) id: number) { return this.svc.resolve(id); }
}
