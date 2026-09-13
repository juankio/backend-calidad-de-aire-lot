import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardSuccessResponse<T> {
  success: true;
  data: T | null;
  message: string;
  error: null;
  [key: string]: any;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, StandardSuccessResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardSuccessResponse<T>> {
    return next.handle().pipe(
      map((res) => {
        // If controller explicitly returns custom structure with data & message
        if (
          res !== null &&
          typeof res === 'object' &&
          'data' in res &&
          ('message' in res || 'success' in res)
        ) {
          return {
            success: true,
            message: res.message || 'Operación realizada con éxito',
            error: null,
            ...res,
            data: res.data !== undefined ? res.data : null,
          };
        }

        // Standard wrapping for raw data or collections
        return {
          success: true,
          data: res !== undefined ? res : null,
          message: 'Operación realizada con éxito',
          error: null,
        };
      }),
    );
  }
}
