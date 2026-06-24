import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        branch: { select: { id: true, name: true, nameAr: true } },
        userBranches: {
          include: { branch: { select: { id: true, name: true, nameAr: true } } },
        },
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const branchIds = user.userBranches.map((ub) => ub.branchId);
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      branchIds: branchIds.length > 0 ? branchIds : (user.branchId ? [user.branchId] : []),
    };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', 'refresh_secret'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    const { password: _, ...safeUser } = user;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        ...safeUser,
        assignedBranches: user.userBranches.map((ub) => ({
          id: ub.branch.id,
          name: ub.branch.name,
          nameAr: ub.branch.nameAr,
          isPrimary: ub.isPrimary,
        })),
      },
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get('JWT_REFRESH_SECRET', 'refresh_secret'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { userBranches: { select: { branchId: true } } },
      });
      if (!user || !user.isActive) throw new UnauthorizedException();
      const branchIds = user.userBranches.map((ub) => ub.branchId);
      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        branchIds: branchIds.length > 0 ? branchIds : (user.branchId ? [user.branchId] : []),
      };
      return { access_token: this.jwt.sign(newPayload) };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        branch: { select: { id: true, name: true, nameAr: true } },
        userBranches: {
          include: { branch: { select: { id: true, name: true, nameAr: true } } },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    const { password: _, ...safeUser } = user;
    return {
      ...safeUser,
      assignedBranches: user.userBranches.map((ub) => ({
        id: ub.branch.id,
        name: ub.branch.name,
        nameAr: ub.branch.nameAr,
        isPrimary: ub.isPrimary,
      })),
    };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hash } });
    return { message: 'Password changed successfully' };
  }

  async switchBranch(userId: number, branchId: number) {
    const assignment = await this.prisma.userBranch.findUnique({
      where: { userId_branchId: { userId, branchId } },
    });
    if (!assignment) {
      // Super admins can switch to any branch
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.role !== 'SUPER_ADMIN') {
        throw new BadRequestException('You are not assigned to this branch');
      }
    }
    await this.prisma.user.update({ where: { id: userId }, data: { branchId } });
    return this.getProfile(userId);
  }
}
