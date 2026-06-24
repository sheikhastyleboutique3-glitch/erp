import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_COMPLETED, OrderCompletedEvent } from '../../common/events/order-events';

/**
 * Non-blocking side effects for a completed sale. These run AFTER the checkout
 * transaction has committed, so a failure here can never roll back a paid
 * order. Kept deliberately decoupled from SalesService.
 *
 * `async: true` runs the handler off the request thread.
 */
@Injectable()
export class OrderCompletedListener {
  private readonly logger = new Logger('OrderCompleted');

  @OnEvent(ORDER_COMPLETED, { async: true })
  async handle(evt: OrderCompletedEvent): Promise<void> {
    // Lightweight analytics log. This is the extension point for refreshing
    // cached dashboard stats, pushing to an analytics sink, or fanning out
    // notifications — all without blocking the POS response.
    const margin = evt.total > 0 ? ((evt.grossProfit / evt.total) * 100).toFixed(1) : '0.0';
    this.logger.log(
      `Sale ${evt.orderNo} (branch ${evt.branchId}, ${evt.channel}) ` +
        `total=${evt.total.toFixed(2)} foodCost=${evt.foodCost.toFixed(2)} ` +
        `grossProfit=${evt.grossProfit.toFixed(2)} margin=${margin}%`,
    );
  }
}
