import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(branchId?: number, role?: Role) {
    const users = await this.prisma.user.findMany({
      where: {
        ...(branchId && { branchId }),
        ...(role && { role }),
      },
      include: {
        branch: { select: { id: true, name: true, nameAr: true } },
        userBranches: {
          include: { branch: { select: { id: true, name: true, nameAr: true } } },
        },
      },
      orderBy: { firstName: 'asc' },
    });
    return users.map(({ password: _, ...u }) => ({
      ...u,
      assignedBranches: u.userBranches.map((ub) => ({
        id: ub.branch.id,
        name: ub.branch.name,
        nameAr: ub.branch.nameAr,
        isPrimary: ub.isPrimary,
      })),
    }));
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, nameAr: true } },
        userBranches: {
          include: { branch: { select: { id: true, name: true, nameAr: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { password: _, ...safe } = user;
    return {
      ...safe,
      assignedBranches: user.userBranches.map((ub) => ({
        id: ub.branch.id,
        name: ub.branch.name,
        nameAr: ub.branch.nameAr,
        isPrimary: ub.isPrimary,
      })),
    };
  }

  async create(dto: any, actorId?: number) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');
    const hash = await bcrypt.hash(dto.password, 12);
    const { assignedBranchIds, ...userData } = dto;
    const user = await this.prisma.user.create({
      data: { ...userData, password: hash },
      include: { branch: { select: { id: true, name: true, nameAr: true } } },
    });
    if (assignedBranchIds?.length) {
      await this.prisma.userBranch.createMany({
        data: assignedBranchIds.map((branchId: number, idx: number) => ({
          userId: user.id, branchId, isPrimary: idx === 0,
        })),
        skipDuplicates: true,
      });
    } else if (user.branchId) {
      await this.prisma.userBranch.upsert({
        where: { userId_branchId: { userId: user.id, branchId: user.branchId } },
        update: {},
        create: { userId: user.id, branchId: user.branchId, isPrimary: true },
      });
    }
    this.audit.create({
      userId: actorId,
      action: 'CREATE',
      entity: 'user',
      entityId: String(user.id),
      newValues: { email: user.email, role: user.role },
    }).catch(() => {});
    const { password: _, ...safe } = user;
    return safe;
  }

  async update(id: number, dto: any, actorId?: number) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, role: true, isActive: true, branchId: true },
    });
    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 12);
    }
    const { assignedBranchIds, ...userData } = dto;
    const user = await this.prisma.user.update({
      where: { id },
      data: userData,
      include: { branch: { select: { id: true, name: true, nameAr: true } } },
    });
    if (assignedBranchIds !== undefined) {
      await this.prisma.userBranch.deleteMany({ where: { userId: id } });
      if (assignedBranchIds.length) {
        await this.prisma.userBranch.createMany({
          data: assignedBranchIds.map((branchId: number, idx: number) => ({
            userId: id, branchId, isPrimary: idx === 0,
          })),
          skipDuplicates: true,
        });
      }
    }
    this.audit.create({
      userId: actorId,
      action: 'UPDATE',
      entity: 'user',
      entityId: String(id),
      oldValues: before ?? undefined,
      newValues: { role: user.role, isActive: user.isActive },
    }).catch(() => {});
    const { password: _, ...safe } = user;
    return safe;
  }

  async remove(id: number, actorId?: number) {
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    this.audit.create({
      userId: actorId,
      action: 'DEACTIVATE',
      entity: 'user',
      entityId: String(id),
    }).catch(() => {});
    return { message: 'User deactivated' };
  }
}
