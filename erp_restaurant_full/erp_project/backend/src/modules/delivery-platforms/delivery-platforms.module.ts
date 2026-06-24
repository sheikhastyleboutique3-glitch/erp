import { Module } from '@nestjs/common';
import { DeliveryPlatformsService } from './delivery-platforms.service';
import { DeliveryPlatformsController } from './delivery-platforms.controller';

@Module({
  controllers: [DeliveryPlatformsController],
  providers: [DeliveryPlatformsService],
  exports: [DeliveryPlatformsService],
})
export class DeliveryPlatformsModule {}
