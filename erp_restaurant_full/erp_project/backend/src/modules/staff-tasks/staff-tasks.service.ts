import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Prisma,
  StaffTaskCategory,
  StaffTaskPriority,
  StaffTaskStatus,
} from '@prisma/client';

export interface ChecklistItem {
  label: string;
  done?: boolean;
}

export interface CreateStaffTaskInput {
  branchId: number;
  title: string;
  titleAr?: string;
  description?: string;
  category?: StaffTaskCategory;
  priority?: StaffTaskPriority;
  assignedToId?: number;
  dueAt?: string;
  checklist?: ChecklistItem[];
  recurrence?: string;
}

export type UpdateStaffTaskInput = Partial<Omit<CreateStaffTaskInput, 'branchId'>> & {
  status?: StaffTaskStatus;
};

@Injectable()
export class StaffTasksService {
  constructor(private prisma: PrismaService) {}

  list(filters?: {
    branchId?: number;
    status?: StaffTaskStatus;
    category?: StaffTaskCategory;
    assignedToId?: number;
  }) {
    return this.prisma.staffTask.findMany({
      where: {
        ...(filters?.branchId ? { branchId: filters.branchId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.assignedToId ? { assignedToId: filters.assignedToId } : {}),
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  async get(id: number) {
    const task = await this.prisma.staffTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  create(dto: CreateStaffTaskInput, userId?: number) {
    return this.prisma.staffTask.create({
      data: {
        branchId: dto.branchId,
        title: dto.title,
        titleAr: dto.titleAr,
        description: dto.description,
        category: dto.category ?? StaffTaskCategory.CLEANING,
        priority: dto.priority ?? StaffTaskPriority.NORMAL,
        assignedToId: dto.assignedToId ?? null,
        createdById: userId ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        checklist: (dto.checklist ?? []) as unknown as Prisma.InputJsonValue,
        recurrence: dto.recurrence,
      },
    });
  }

  async update(id: number, dto: UpdateStaffTaskInput) {
    await this.get(id);
    // Auto-stamp completion time when moving to DONE (and clear it otherwise).
    const completedAt =
      dto.status === StaffTaskStatus.DONE ? new Date() : dto.status ? null : undefined;
    return this.prisma.staffTask.update({
      where: { id },
      data: {
        title: dto.title,
        titleAr: dto.titleAr,
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        status: dto.status,
        assignedToId: dto.assignedToId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        checklist:
          dto.checklist !== undefined
            ? (dto.checklist as unknown as Prisma.InputJsonValue)
            : undefined,
        recurrence: dto.recurrence,
        completedAt,
      },
    });
  }

  /** Toggle a single checklist line; flips the task to IN_PROGRESS/DONE as needed. */
  async toggleChecklistItem(id: number, index: number, done: boolean) {
    const task = await this.get(id);
    const checklist = Array.isArray(task.checklist)
      ? ([...(task.checklist as unknown as ChecklistItem[])])
      : [];
    if (index < 0 || index >= checklist.length) {
      return task;
    }
    checklist[index] = { ...checklist[index], done };
    const allDone = checklist.length > 0 && checklist.every((c) => c.done);
    const anyDone = checklist.some((c) => c.done);
    let status: StaffTaskStatus | undefined;
    if (allDone) status = StaffTaskStatus.DONE;
    else if (anyDone && task.status === StaffTaskStatus.PENDING) status = StaffTaskStatus.IN_PROGRESS;
    return this.prisma.staffTask.update({
      where: { id },
      data: {
        checklist: checklist as unknown as Prisma.InputJsonValue,
        ...(status ? { status } : {}),
        ...(status === StaffTaskStatus.DONE ? { completedAt: new Date() } : {}),
      },
    });
  }

  async remove(id: number) {
    await this.get(id);
    await this.prisma.staffTask.delete({ where: { id } });
    return { success: true };
  }
}
