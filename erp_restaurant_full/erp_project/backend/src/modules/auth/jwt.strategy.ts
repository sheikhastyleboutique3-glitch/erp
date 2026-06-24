import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', 'fallback_secret'),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userBranches: { select: { branchId: true, isPrimary: true } },
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    const branchIds = user.userBranches.map((ub) => ub.branchId);
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      branchIds: branchIds.length > 0 ? branchIds : (user.branchId ? [user.branchId] : []),
    };
  }
}
