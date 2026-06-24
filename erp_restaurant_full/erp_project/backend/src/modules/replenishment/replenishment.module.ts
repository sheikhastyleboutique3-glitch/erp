import { Module } from '@nestjs/common';
import { ReplenishmentService } from './replenishment.service';
import { ReplenishmentController } from './replenishment.controller';

@Module({
  controllers: [ReplenishmentController],
  providers: [ReplenishmentService],
  exports: [ReplenishmentService],
})
export class ReplenishmentModule {}
