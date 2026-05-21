import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erreur interne du serveur';
    let errors: Array<{ field: string; message: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object') {
        const res = exResponse as Record<string, unknown>;
        message = (res.message as string) || message;
        if (Array.isArray(res.message)) {
          errors = res.message.map((m: string) => ({
            field: 'unknown',
            message: m,
          }));
          message = 'Erreur de validation';
        }
      }

      if (status >= 500) {
        this.logger.error(`Server error ${status}`, {
          method: request.method,
          url: request.url,
          message,
        });
        // 5xx HttpExceptions are server-side bugs (e.g. ServiceUnavailable
        // thrown explicitly by health checks, BadGateway from a failed
        // upstream). Capture them too — silently swallowing these was
        // exactly the kind of gap Sentry is supposed to close. 4xx are
        // client-driven and stay out of Sentry to avoid noise.
        Sentry.captureException(exception, {
          tags: { method: request.method, status: String(status) },
          extra: { url: request.url },
          user: { id: (request as any).user?.sub ?? 'anonymous' },
        });
      }
    } else {
      this.logger.error('Unhandled exception', {
        method: request.method,
        url: request.url,
        userId: (request as any).user?.sub || 'anonymous',
        error:
          exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
      Sentry.captureException(exception, {
        tags: { method: request.method, kind: 'unhandled' },
        extra: { url: request.url },
        user: { id: (request as any).user?.sub ?? 'anonymous' },
      });
    }

    response.status(status).json({
      success: false,
      error: {
        status,
        message,
        ...(errors && { errors }),
      },
    });
  }
}
