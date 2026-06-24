import { Controller, Get, Post, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get('config')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all notification configs (WhatsApp, Email SMTP)' })
  getConfigs() {
    return this.svc.getConfigs();
  }

  @Post('config')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Set a notification config value' })
  upsertConfig(
    @Body() body: { key: string; value: string; group?: string },
  ) {
    return this.svc.upsertConfig(body.key, body.value, body.group);
  }

  // ---- In-app notification inbox (sound + clickable popup) ----

  @Get('inbox')
  @ApiOperation({ summary: 'List the current user in-app notifications' })
  getInbox(
    @CurrentUser('sub') userId: number,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('take') take?: string,
  ) {
    return this.svc.getInbox(userId, {
      unreadOnly: unreadOnly === 'true',
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread in-app notifications' })
  getUnreadCount(@CurrentUser('sub') userId: number) {
    return this.svc.getUnreadCount(userId);
  }

  @Patch('read')
  @ApiOperation({ summary: 'Mark specific notifications as read' })
  markRead(
    @CurrentUser('sub') userId: number,
    @Body() body: { ids: number[] },
  ) {
    return this.svc.markRead(userId, body.ids || []);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('sub') userId: number) {
    return this.svc.markAllRead(userId);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get current user notification preferences' })
  getPreferences(@CurrentUser('sub') userId: number) {
    return this.svc.getPreferences(userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update user notification preferences' })
  updatePreferences(
    @CurrentUser('sub') userId: number,
    @Body()
    body: {
      preferences: {
        channel: string;
        eventType: string;
        enabled: boolean;
        whatsappNumber?: string;
      }[];
    },
  ) {
    return this.svc.updatePreferences(userId, body.preferences);
  }

  @Post('test-whatsapp')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Send a test WhatsApp message' })
  testWhatsApp(@Body() body: { phoneNumber: string; message: string }) {
    return this.svc.sendWhatsApp(body.phoneNumber, body.message);
  }

  @Post('test-email')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Send a test email' })
  testEmail(
    @Body() body: { to: string; subject: string; body: string },
  ) {
    return this.svc.sendEmail(body.to, body.subject, body.body);
  }

  @Post('trigger')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Trigger notification event to all subscribers' })
  triggerEvent(
    @Body()
    body: {
      eventType: string;
      title: string;
      message: string;
      branchId?: number;
    },
  ) {
    return this.svc.triggerEvent(body.eventType, body);
  }
}
