import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AlertType } from '@prisma/client';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}
  findAll(branchId?: number, isRead?: boolean) {
    return this.prisma.alert.findMany({ where: { ...(branchId && { branchId }), ...(isRead !== undefined && { isRead }), isResolved: false }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
  markRead(id: number) { return this.prisma.alert.update({ where: { id }, data: { isRead: true } }); }
  resolve(id: number) { return this.prisma.alert.update({ where: { id }, data: { isResolved: true } }); }
  async generateExpiryAlerts() {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 7);
    const nearExpiry = await this.prisma.inventory.findMany({ where: { expiryDate: { lte: cutoff }, quantity: { gt: 0 } }, include: { product: true, branch: true } });
    for (const item of nearExpiry) {
      const existing = await this.prisma.alert.findFirst({ where: { type: AlertType.EXPIRY_WARNING, productId: item.productId, branchId: item.branchId, isResolved: false } });
      if (!existing) {
        const daysLeft = Math.ceil((item.expiryDate!.getTime() - Date.now()) / 86400000);
        await this.prisma.alert.create({ data: { type: AlertType.EXPIRY_WARNING, title: `Expiry Warning: ${item.product.name}`, titleAr: `\u062a\u062d\u0630\u064a\u0631: ${item.product.nameAr}`, message: `${item.product.name} at ${item.branch.name} expires in ${daysLeft} day(s)`, branchId: item.branchId, productId: item.productId } });
      }
    }
    return { generated: nearExpiry.length };
  }
  async generateLowStockAlerts() {
    const inventory = await this.prisma.inventory.findMany({ include: { product: true, branch: true } });
    let count = 0;
    for (const item of inventory) {
      if (item.quantity <= item.product.minStockLevel) {
        const existing = await this.prisma.alert.findFirst({ where: { type: AlertType.LOW_STOCK, productId: item.productId, branchId: item.branchId, isResolved: false } });
        if (!existing) { await this.prisma.alert.create({ data: { type: AlertType.LOW_STOCK, title: `Low Stock: ${item.product.name}`, titleAr: `\u0645\u062e\u0632\u0648\u0646 \u0645\u0646\u062e\u0641\u0636: ${item.product.nameAr}`, message: `${item.product.name} at ${item.branch.name}: ${item.quantity} remaining`, branchId: item.branchId, productId: item.productId } }); count++; }
      }
    }
    return { generated: count };
  }
}
