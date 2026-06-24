import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type NotificationEntityType = 'requisition' | 'purchase_order' | 'alert';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ============================================================
  // In-app notification inbox (sound + clickable popup per user)
  // ============================================================

  /**
   * Which roles should receive each event, in addition to the requisition
   * creator. "Everyone with permission to be notified" is expressed here, so
   * it is easy to tune without touching business logic.
   */
  private static readonly EVENT_ROLES: Record<string, Role[]> = {
    REQUISITION_CREATED: [Role.SUPER_ADMIN, Role.PROCUREMENT, Role.BRANCH_MANAGER],
    REQUISITION_APPROVED: [Role.SUPER_ADMIN, Role.PROCUREMENT],
    REQUISITION_MODIFIED: [Role.SUPER_ADMIN, Role.PROCUREMENT],
    REQUISITION_CANCELLED: [Role.SUPER_ADMIN, Role.PROCUREMENT],
    REQUISITION_ORDER_PLACED: [Role.SUPER_ADMIN, Role.PROCUREMENT, Role.BRANCH_MANAGER],
    REQUISITION_RECEIVED_WAREHOUSE: [Role.SUPER_ADMIN, Role.PROCUREMENT, Role.WAREHOUSE, Role.BRANCH_MANAGER],
    REQUISITION_DISPATCHED: [Role.SUPER_ADMIN, Role.PROCUREMENT, Role.WAREHOUSE, Role.BRANCH_MANAGER],
    REQUISITION_CONFIRMED: [Role.SUPER_ADMIN, Role.PROCUREMENT, Role.BRANCH_MANAGER],
    PO_CREATED: [Role.SUPER_ADMIN, Role.PROCUREMENT, Role.WAREHOUSE],
    PO_STATUS_UPDATED: [Role.SUPER_ADMIN, Role.PROCUREMENT, Role.WAREHOUSE],
    PO_RECEIVED: [Role.SUPER_ADMIN, Role.PROCUREMENT, Role.WAREHOUSE],
  };

  private channelFor(entityType: NotificationEntityType): string {
    if (entityType === 'purchase_order') return 'orders';
    if (entityType === 'alert') return 'alerts';
    return 'requisitions';
  }

  /**
   * Resolve recipient user IDs for an event: all active users whose role is in
   * `roles` (branch managers are limited to the relevant branch), plus the
   * requisition creator when provided.
   */
  private async resolveRecipients(
    roles: Role[],
    branchId?: number,
    creatorId?: number,
  ): Promise<number[]> {
    const ids = new Set<number>();
    if (roles.length) {
      const users = await this.prisma.user.findMany({
        where: { isActive: true, role: { in: roles } },
        select: {
          id: true,
          role: true,
          branchId: true,
          userBranches: { select: { branchId: true } },
        },
      });
      for (const u of users) {
        // Branch managers only hear about events for branches they manage.
        if (u.role === Role.BRANCH_MANAGER && branchId) {
          const assigned =
            u.branchId === branchId ||
            u.userBranches.some((ub) => ub.branchId === branchId);
          if (!assigned) continue;
        }
        ids.add(u.id);
      }
    }
    if (creatorId) ids.add(creatorId);
    return [...ids];
  }

  /**
   * Central event dispatcher. Creates one in-app notification row per eligible
   * recipient (so each gets their own sound + clickable popup) and also fans
   * the event out to email / WhatsApp subscribers. Never throws — notification
   * delivery must never break the underlying business action.
   */
  async emit(input: {
    eventType: string;
    entityType: NotificationEntityType;
    entityId: number;
    link: string;
    title: string;
    titleAr?: string;
    message: string;
    messageAr?: string;
    branchId?: number | null;
    actorId?: number | null;
    creatorId?: number | null;
    roles?: Role[];
  }): Promise<void> {
    try {
      const roles =
        input.roles ??
        NotificationsService.EVENT_ROLES[input.eventType] ??
        [Role.SUPER_ADMIN, Role.PROCUREMENT];
      const recipientIds = await this.resolveRecipients(
        roles,
        input.branchId ?? undefined,
        input.creatorId ?? undefined,
      );
      // Don't notify the person who performed the action about their own action.
      const finalIds = recipientIds.filter((id) => id !== (input.actorId ?? -1));
      if (finalIds.length) {
        const channel = this.channelFor(input.entityType);
        await this.prisma.notification.createMany({
          data: finalIds.map((userId) => ({
            userId,
            eventType: input.eventType,
            channel,
            title: input.title,
            titleAr: input.titleAr,
            message: input.message,
            messageAr: input.messageAr,
            entityType: input.entityType,
            entityId: input.entityId,
            link: input.link,
            branchId: input.branchId ?? undefined,
            actorId: input.actorId ?? undefined,
          })),
        });
      }
    } catch (err) {
      this.logger.error(`emit notification failed: ${err}`);
    }
    // External channels (email / WhatsApp) for opted-in subscribers, non-blocking.
    this.triggerEvent(input.eventType, {
      title: input.title,
      message: input.message,
      branchId: input.branchId ?? undefined,
    }).catch(() => {});
  }

  async getInbox(
    userId: number,
    opts: { unreadOnly?: boolean; take?: number } = {},
  ) {
    return this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { isRead: false } : {}) },
      orderBy: { id: 'desc' },
      take: Math.min(opts.take ?? 50, 200),
    });
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: number, ids: number[]) {
    if (ids?.length) {
      await this.prisma.notification.updateMany({
        where: { userId, id: { in: ids } },
        data: { isRead: true, readAt: new Date() },
      });
    }
    return this.getUnreadCount(userId);
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { count: 0 };
  }

  // ---- Admin: Global notification configs ----
  getConfigs() {
    return this.prisma.notificationConfig.findMany({ orderBy: { key: 'asc' } });
  }

  async upsertConfig(key: string, value: string, group = 'notifications') {
    return this.prisma.notificationConfig.upsert({
      where: { key },
      update: { value, group },
      create: { key, value, group },
    });
  }

  // ---- User preferences ----
  async getPreferences(userId: number) {
    return this.prisma.userNotificationPreference.findMany({
      where: { userId },
    });
  }

  async updatePreferences(
    userId: number,
    prefs: {
      channel: string;
      eventType: string;
      enabled: boolean;
      whatsappNumber?: string;
    }[],
  ) {
    const results = [];
    for (const p of prefs) {
      const result = await this.prisma.userNotificationPreference.upsert({
        where: {
          userId_channel_eventType: {
            userId,
            channel: p.channel,
            eventType: p.eventType,
          },
        },
        update: { enabled: p.enabled, whatsappNumber: p.whatsappNumber },
        create: {
          userId,
          channel: p.channel,
          eventType: p.eventType,
          enabled: p.enabled,
          whatsappNumber: p.whatsappNumber,
        },
      });
      results.push(result);
    }
    return results;
  }

  // ---- Phase 6: WhatsApp dispatch via Meta Business API ----
  async sendWhatsApp(phoneNumber: string, message: string): Promise<boolean> {
    try {
      const tokenConfig = await this.prisma.notificationConfig.findUnique({
        where: { key: 'whatsapp_api_token' },
      });
      const phoneIdConfig = await this.prisma.notificationConfig.findUnique({
        where: { key: 'whatsapp_phone_number_id' },
      });

      if (!tokenConfig?.value || !phoneIdConfig?.value) {
        this.logger.warn('WhatsApp API not configured. Skipping send.');
        return false;
      }

      const url = `https://graph.facebook.com/v18.0/${phoneIdConfig.value}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenConfig.value}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneNumber.replace(/[^0-9]/g, ''),
          type: 'text',
          text: { body: message },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`WhatsApp send failed: ${err}`);
        return false;
      }

      this.logger.log(`WhatsApp sent to ${phoneNumber}`);
      return true;
    } catch (err) {
      this.logger.error(`WhatsApp send error: ${err}`);
      return false;
    }
  }

  // ---- Phase 6: Email dispatch via SMTP/Nodemailer ----
  async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<boolean> {
    try {
      // Dynamic import to avoid hard dependency if nodemailer not installed
      let nodemailer: any;
      try {
        nodemailer = require('nodemailer');
      } catch {
        this.logger.warn('nodemailer not installed. Skipping email send.');
        return false;
      }

      const smtpHost = await this.getConfigValue('email_smtp_host');
      const smtpPort = await this.getConfigValue('email_smtp_port');
      const smtpUser = await this.getConfigValue('email_smtp_user');
      const smtpPass = await this.getConfigValue('email_smtp_pass');
      const fromAddress = await this.getConfigValue('email_from_address');

      if (!smtpHost || !smtpUser) {
        this.logger.warn('Email SMTP not configured. Skipping send.');
        return false;
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort || '587', 10),
        secure: smtpPort === '465',
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: fromAddress || smtpUser,
        to,
        subject,
        html: body,
      });

      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err}`);
      return false;
    }
  }

  // ---- Phase 6: Trigger notification to all subscribed users for an event ----
  async triggerEvent(
    eventType: string,
    payload: { title: string; message: string; branchId?: number },
  ) {
    const subscribers = await this.prisma.userNotificationPreference.findMany({
      where: { eventType, enabled: true },
      include: { user: { select: { id: true, email: true, firstName: true } } },
    });

    const results = { whatsapp: 0, email: 0, failed: 0 };

    for (const sub of subscribers) {
      try {
        if (sub.channel === 'whatsapp' && sub.whatsappNumber) {
          const sent = await this.sendWhatsApp(
            sub.whatsappNumber,
            `${payload.title}\n\n${payload.message}`,
          );
          if (sent) results.whatsapp++;
          else results.failed++;
        } else if (sub.channel === 'email' && sub.user.email) {
          const sent = await this.sendEmail(
            sub.user.email,
            payload.title,
            `<h3>${payload.title}</h3><p>${payload.message}</p>`,
          );
          if (sent) results.email++;
          else results.failed++;
        }
      } catch {
        results.failed++;
      }
    }

    return results;
  }

  private async getConfigValue(key: string): Promise<string | null> {
    const config = await this.prisma.notificationConfig.findUnique({
      where: { key },
    });
    return config?.value || null;
  }
}
