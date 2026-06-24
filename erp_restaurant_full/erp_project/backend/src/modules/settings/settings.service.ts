import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  findAll(group?: string) {
    return this.prisma.setting.findMany({
      where: group ? { group } : undefined,
      orderBy: { key: 'asc' },
    });
  }

  async upsert(key: string, value: string, group = 'general', userId?: number) {
    const result = await this.prisma.setting.upsert({
      where: { key },
      update: { value, group },
      create: { key, value, group },
    });
    this.audit.create({
      userId,
      action: 'SETTINGS_UPDATE',
      entity: 'setting',
      entityId: key,
      newValues: { key, value: key.includes('password') || key.includes('token') || key.includes('secret') ? '[REDACTED]' : value },
    }).catch(() => {});
    return result;
  }

  async upsertMany(settings: { key: string; value: string; group?: string }[], userId?: number) {
    return Promise.all(settings.map(s => this.upsert(s.key, s.value, s.group, userId)));
  }
}
