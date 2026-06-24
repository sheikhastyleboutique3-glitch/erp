import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: TUser,
    info: any,
    context: ExecutionContext,
  ): TUser {
    if (info instanceof TokenExpiredError) {
      throw new UnauthorizedException({
        message: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }
    if (info instanceof JsonWebTokenError) {
      const req = context.switchToHttp().getRequest();
      this.logger.warn(
        `Malformed JWT from IP ${req.ip} on ${req.method} ${req.url}`,
      );
      throw new UnauthorizedException({
        message: 'Invalid token',
        code: 'TOKEN_INVALID',
      });
    }
    if (err) {
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException('Authentication failed');
    }
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
