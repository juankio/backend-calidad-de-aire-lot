import { PipeTransform, ArgumentMetadata, BadRequestException, Injectable } from '@nestjs/common';
import type { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errorDetails = result.error.format ? result.error.format() : result.error;
      throw new BadRequestException({
        message: 'Validación de payload fallida',
        errors: errorDetails,
      });
    }
    return result.data;
  }
}
