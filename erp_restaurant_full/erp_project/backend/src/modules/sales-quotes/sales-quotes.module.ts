import { Module } from '@nestjs/common';
import { SalesQuotesService } from './sales-quotes.service';
import { SalesQuotesController } from './sales-quotes.controller';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [SalesModule],
  controllers: [SalesQuotesController],
  providers: [SalesQuotesService],
  exports: [SalesQuotesService],
})
export class SalesQuotesModule {}
