import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { status, message } = this.resolveException(exception);
    const logMsg = `${request.method} ${request.url} → ${status}: ${message}`;
    if (status >= 500) {
      this.logger.error(logMsg, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logMsg);
    }
    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private resolveException(exception: unknown): { status: number; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message: string;
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        if (Array.isArray(r.message)) {
          message = (r.message as string[]).join('; ');
        } else {
          message = (r.message as string) ?? exception.message;
        }
      } else {
        message = exception.message;
      }
      return { status, message };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { status: HttpStatus.BAD_REQUEST, message: 'Invalid query parameters' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }

  private resolvePrismaError(e: Prisma.PrismaClientKnownRequestError): { status: number; message: string } {
    switch (e.code) {
      case 'P2002': {
        const fields = (e.meta?.target as string[])?.join(', ') ?? 'field';
        return { status: HttpStatus.CONFLICT, message: `A record with this ${fields} already exists` };
      }
      case 'P2025': return { status: HttpStatus.NOT_FOUND, message: 'Record not found' };
      case 'P2003': return { status: HttpStatus.BAD_REQUEST, message: 'Related record not found' };
      case 'P2034': return { status: HttpStatus.CONFLICT, message: 'Transaction conflict — please retry' };
      default:
        this.logger.error(`Unhandled Prisma error ${e.code}`, e.message);
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Database error' };
    }
  }
}
