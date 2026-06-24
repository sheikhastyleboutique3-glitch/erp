import { Module } from '@nestjs/common';
import { PosSessionsService } from './pos-sessions.service';
import { PosSessionsController } from './pos-sessions.controller';

@Module({
  controllers: [PosSessionsController],
  providers: [PosSessionsService],
  exports: [PosSessionsService],
})
export class PosSessionsModule {}
