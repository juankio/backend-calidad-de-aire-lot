import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateSessionSchema,
  UpdateSessionSchema,
  type CreateSessionDto,
  type UpdateSessionDto,
} from './dto/session.dto';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createSession(
    @Body(new ZodValidationPipe(CreateSessionSchema))
    body: CreateSessionDto,
  ) {
    const session = this.sessionsService.createSession(body);
    return {
      data: session,
      message: 'Campaña de medición creada exitosamente',
    };
  }

  @Get()
  getSessions() {
    const sessions = this.sessionsService.getSessions();
    return {
      data: sessions,
      message: 'Listado de campañas obtenido',
    };
  }

  @Patch(':id')
  updateSession(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSessionSchema))
    body: UpdateSessionDto,
  ) {
    const updated = this.sessionsService.updateSession(id, body);
    if (!updated) {
      throw new NotFoundException(`La sesión con ID ${id} no existe`);
    }
    return {
      data: updated,
      message: 'Ubicación actualizada correctamente',
    };
  }

  @Delete(':id')
  deleteSession(@Param('id') id: string) {
    const deleted = this.sessionsService.deleteSession(id);
    if (!deleted) {
      throw new NotFoundException(`La sesión con ID ${id} no existe`);
    }
    return {
      data: { id, deleted: true },
      message: 'Ubicación eliminada correctamente',
    };
  }
}

@Controller('heatmap')
export class HeatmapController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  getHeatmap() {
    const points = this.sessionsService.getHeatmap();
    return {
      data: points,
      message: 'Puntos geoespaciales recuperados',
    };
  }
}
