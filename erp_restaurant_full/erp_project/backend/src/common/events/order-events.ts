/**
 * Domain events emitted by the sales engine. Consumers subscribe via
 * `@OnEvent(ORDER_COMPLETED)` to run NON-BLOCKING side effects (analytics
 * logs, dashboard stat refresh, notifications) without coupling them to the
 * critical, transactional checkout path.
 */
export const ORDER_COMPLETED = 'order.completed';

export interface OrderCompletedEvent {
  orderId: number;
  orderNo: string;
  branchId: number;
  channel: string;
  total: number;
  foodCost: number;
  grossProfit: number;
  customerId?: number | null;
  completedAt: Date;
}
