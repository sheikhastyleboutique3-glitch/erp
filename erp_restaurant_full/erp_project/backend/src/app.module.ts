import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { join } from 'path';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { UnitsModule } from './modules/units/units.module';
import { ProductsModule } from './modules/products/products.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { WastageModule } from './modules/wastage/wastage.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuditModule } from './modules/audit/audit.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { AdminModule } from './modules/admin/admin.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { TransfersModule } from './modules/transfers/transfers.module';
// Restaurant ERP — Increment 1
import { RecipesModule } from './modules/recipes/recipes.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesModule } from './modules/sales/sales.module';
// Restaurant ERP — Increments 2-6
import { FinanceModule } from './modules/finance/finance.module';
import { ProductionModule } from './modules/production/production.module';
import { TablesModule } from './modules/tables/tables.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { KdsModule } from './modules/kds/kds.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ReplenishmentModule } from './modules/replenishment/replenishment.module';
// Restaurant ERP — Increment 8
import { StaffTasksModule } from './modules/staff-tasks/staff-tasks.module';
import { PosSessionsModule } from './modules/pos-sessions/pos-sessions.module';
import { ModifiersModule } from './modules/modifiers/modifiers.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { SalesQuotesModule } from './modules/sales-quotes/sales-quotes.module';
import { StockCountsModule } from './modules/stock-counts/stock-counts.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Event bus — decouples order placement/completion from non-blocking
    // side effects (analytics logs, dashboard stat refresh, notifications).
    EventEmitterModule.forRoot(),
    // Global rate limiting: 100 requests / minute per IP by default.
    // Sensitive endpoints (e.g. login) tighten this with @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Serve frontend SPA - exclude API and uploads routes
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/api/(.*)', '/uploads/(.*)'],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    CategoriesModule,
    UnitsModule,
    ProductsModule,
    SuppliersModule,
    InventoryModule,
    RequisitionsModule,
    PurchaseOrdersModule,
    WastageModule,
    AlertsModule,
    SettingsModule,
    AuditModule,
    UploadsModule,
    AdminModule,
    PricingModule,
    ReportsModule,
    NotificationsModule,
    DriversModule,
    TransfersModule,
    // Restaurant ERP — Increment 1
    RecipesModule,
    CustomersModule,
    SalesModule,
    // Restaurant ERP — Increments 2-6
    FinanceModule,
    ProductionModule,
    TablesModule,
    PromotionsModule,
    KdsModule,
    AnalyticsModule,
    ReplenishmentModule,
    // Restaurant ERP — Increment 8
    StaffTasksModule,
    PosSessionsModule,
    ModifiersModule,
    DeliveriesModule,
    SalesQuotesModule,
    StockCountsModule,
    ReceivablesModule,
  ],
  providers: [
    // Apply rate limiting globally.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
