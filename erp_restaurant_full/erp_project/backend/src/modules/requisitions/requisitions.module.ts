import { Module } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [InventoryModule, AuditModule, NotificationsModule],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
  exports: [RequisitionsService],
})
export class RequisitionsModule {}
