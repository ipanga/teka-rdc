import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
      }
    } else {
      this.logger.error('Unhandled exception', {
        method: request.method,
        url: request.url,
        userId: (request as any).user?.sub || 'anonymous',
        error: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
      // TODO: Sentry.captureException(exception);
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
