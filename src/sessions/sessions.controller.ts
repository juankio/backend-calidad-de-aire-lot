import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateSessionSchema, type CreateSessionDto } from './dto/session.dto';

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
