import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';

@Injectable()
export class AlertsScheduler {
  constructor(private alertsService: AlertsService) {}
  @Cron(CronExpression.EVERY_HOUR)
  async handleAlerts() {
    await this.alertsService.generateExpiryAlerts();
    await this.alertsService.generateLowStockAlerts();
  }
}
