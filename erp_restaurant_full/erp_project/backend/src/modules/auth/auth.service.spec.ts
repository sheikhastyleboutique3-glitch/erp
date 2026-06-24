import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Unit tests for authentication: credential checks, inactive-user lockout,
 * JWT payload shape, password change verification, and branch switching
 * (including SUPER_ADMIN bypass).
 */
describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;

  const baseUser = {
    id: 1,
    email: 'admin@example.com',
    password: 'HASH',
    role: 'SUPER_ADMIN',
    branchId: 2,
    isActive: true,
    branch: { id: 2, name: 'HQ', nameAr: 'HQ' },
    userBranches: [{ branchId: 2, isPrimary: true, branch: { id: 2, name: 'HQ', nameAr: 'HQ' } }],
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      userBranch: { findUnique: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token'), verify: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: (_k: string, d?: any) => d } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('login', () => {
    it('rejects an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('x@y.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
      await expect(service.login(baseUser.email, 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      await expect(service.login(baseUser.email, 'bad')).rejects.toThrow(UnauthorizedException);
    });

    it('returns tokens + a password-stripped user on success', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      const res = await service.login(baseUser.email, 'good');
      expect(res.access_token).toBeDefined();
      expect(res.refresh_token).toBeDefined();
      expect((res.user as any).password).toBeUndefined();
      expect(res.user.assignedBranches).toEqual([{ id: 2, name: 'HQ', nameAr: 'HQ', isPrimary: true }]);
      // payload carries branchIds derived from userBranches
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload).toMatchObject({ sub: 1, role: 'SUPER_ADMIN', branchIds: [2] });
    });
  });

  describe('refreshToken', () => {
    it('rejects an invalid/expired refresh token', async () => {
      jwt.verify.mockImplementation(() => { throw new Error('bad'); });
      await expect(service.refreshToken('nope')).rejects.toThrow(UnauthorizedException);
    });

    it('issues a new access token for a valid refresh token', async () => {
      jwt.verify.mockReturnValue({ sub: 1 });
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, userBranches: [{ branchId: 2 }] });
      const res = await service.refreshToken('valid');
      expect(res.access_token).toBe('signed.jwt.token');
    });
  });

  describe('changePassword', () => {
    it('rejects when the current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      await expect(service.changePassword(1, 'wrong', 'newpassword')).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('hashes and stores the new password when current is correct', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      const hashSpy = jest.spyOn(bcrypt, 'hash').mockResolvedValue('NEWHASH' as never);
      const res = await service.changePassword(1, 'current', 'newpassword');
      expect(hashSpy).toHaveBeenCalledWith('newpassword', 12); // cost factor hardened to 12
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { password: 'NEWHASH' } });
      expect(res.message).toMatch(/changed/i);
    });
  });

  describe('switchBranch', () => {
    it('blocks a non-admin from switching to an unassigned branch', async () => {
      prisma.userBranch.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'BRANCH_MANAGER' });
      await expect(service.switchBranch(1, 99)).rejects.toThrow(BadRequestException);
    });

    it('lets a SUPER_ADMIN switch to any branch', async () => {
      prisma.userBranch.findUnique.mockResolvedValue(null);
      // first findUnique = role check (SUPER_ADMIN), second = getProfile
      prisma.user.findUnique
        .mockResolvedValueOnce({ ...baseUser, role: 'SUPER_ADMIN' })
        .mockResolvedValueOnce(baseUser);
      await service.switchBranch(1, 99);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { branchId: 99 } });
    });
  });
});
