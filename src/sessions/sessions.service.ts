import { Injectable, Logger } from '@nestjs/common';
import { SessionsRepository } from './sessions.repository';
import type { CreateSessionDto, UpdateSessionDto } from './dto/session.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private readonly sessionsRepository: SessionsRepository) {}

  /**
   * Crea una nueva campaña / sesión geo-referenciada
   */
  createSession(data: CreateSessionDto) {
    const id = crypto.randomUUID();
    return this.sessionsRepository.create(id, data);
  }

  /**
   * Actualiza los datos de una campaña / sesión existente
   */
  updateSession(id: string, data: UpdateSessionDto) {
    const existing = this.sessionsRepository.findById(id);

    if (!existing) {
      return null;
    }

    return this.sessionsRepository.update(id, {
      name: data.name !== undefined ? data.name : existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      latitude: data.latitude !== undefined ? data.latitude : existing.latitude,
      longitude: data.longitude !== undefined ? data.longitude : existing.longitude,
      radius_meters: data.radius_meters !== undefined ? data.radius_meters : existing.radius_meters,
      end_time: data.end_time !== undefined ? data.end_time : existing.end_time,
    });
  }

  /**
   * Elimina una sesión y desasocia sus telemetrías
   */
  deleteSession(id: string) {
    return this.sessionsRepository.delete(id);
  }

  /**
   * Obtiene todas las sesiones con métricas de calidad de aire agregadas (Gold View)
   */
  getSessions() {
    return this.sessionsRepository.findAllGold();
  }

  /**
   * Obtiene puntos geoespaciales para el mapa de calor
   */
  getHeatmap() {
    return this.sessionsRepository.getHeatmapPoints();
  }
}
