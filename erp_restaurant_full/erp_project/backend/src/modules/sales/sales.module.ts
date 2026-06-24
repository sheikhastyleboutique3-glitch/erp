import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { RecipesModule } from '../recipes/recipes.module';
import { FinanceModule } from '../finance/finance.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  // InventoryModule exports InventoryService (the FEFO deduction engine reused here).
  imports: [InventoryModule, RecipesModule, FinanceModule, PromotionsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
