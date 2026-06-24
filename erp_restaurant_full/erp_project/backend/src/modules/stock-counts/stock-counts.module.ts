import { Module } from '@nestjs/common';
import { StockCountsService } from './stock-counts.service';
import { StockCountsController } from './stock-counts.controller';

@Module({
  controllers: [StockCountsController],
  providers: [StockCountsService],
  exports: [StockCountsService],
})
export class StockCountsModule {}
