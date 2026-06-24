import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],   // exported so other modules can inject it
})
export class AuditModule {}
