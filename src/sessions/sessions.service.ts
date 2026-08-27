import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateSessionDto } from './dto/session.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Crea una nueva campaña / sesión geo-referenciada
   */
  createSession(data: CreateSessionDto) {
    const id = crypto.randomUUID();

    this.databaseService.run(
      `INSERT INTO measurement_sessions (id, name, description, latitude, longitude, radius_meters, start_time, end_time, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.description || '',
        data.latitude,
        data.longitude,
        data.radius_meters,
        data.start_time,
        data.end_time || null,
        data.device_id,
      ],
    );

    return this.databaseService
      .query(`SELECT * FROM measurement_sessions WHERE id = ?`)
      .get(id) as Record<string, any>;
  }

  /**
   * Obtiene todas las sesiones con métricas de calidad de aire agregadas (Gold View)
   */
  getSessions() {
    return this.databaseService
      .query(`SELECT * FROM gold_session_metrics ORDER BY start_time DESC`)
      .all() as Array<Record<string, any>>;
  }

  /**
   * Obtiene puntos geoespaciales para el mapa de calor
   */
  getHeatmap() {
    return this.databaseService
      .query(
        `SELECT session_id, name, latitude, longitude, radius_meters, avg_ppm, max_ppm, total_samples as sample_count
         FROM gold_session_metrics
         WHERE total_samples > 0`,
      )
      .all() as Array<Record<string, any>>;
  }
}
