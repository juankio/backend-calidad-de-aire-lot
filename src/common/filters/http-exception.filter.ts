import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export interface StandardErrorResponse {
  success: false;
  data: null;
  message: string;
  error: any;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Fallo interno del servidor';
    let error: any = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message || exception.message || 'Error en la petición';
        error = resObj.errors !== undefined ? resObj.errors : (resObj.error !== undefined ? resObj.error : resObj);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`[Unhandled Error] ${exception.message}`, exception.stack);
      message = exception.message || 'Error interno inesperado';
      error = exception.name || 'InternalError';
    } else {
      this.logger.error('[Unknown Error]', exception);
      message = 'Error desconocido en el servidor';
      error = 'UnknownError';
    }

    const payload: StandardErrorResponse = {
      success: false,
      data: null,
      message,
      error,
    };

    response.status(status).json(payload);
  }
}
