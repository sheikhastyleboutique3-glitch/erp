import { Module } from '@nestjs/common';
import { StaffTasksService } from './staff-tasks.service';
import { StaffTasksController } from './staff-tasks.controller';

@Module({
  controllers: [StaffTasksController],
  providers: [StaffTasksService],
  exports: [StaffTasksService],
})
export class StaffTasksModule {}
