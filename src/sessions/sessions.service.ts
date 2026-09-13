import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateSessionDto, UpdateSessionDto } from './dto/session.dto';

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
   * Actualiza los datos de una campaña / sesión existente
   */
  updateSession(id: string, data: UpdateSessionDto) {
    const existing = this.databaseService
      .query(`SELECT * FROM measurement_sessions WHERE id = ?`)
      .get(id) as Record<string, any> | null;

    if (!existing) {
      return null;
    }

    const updatedName = data.name !== undefined ? data.name : existing.name;
    const updatedDesc = data.description !== undefined ? data.description : existing.description;
    const updatedLat = data.latitude !== undefined ? data.latitude : existing.latitude;
    const updatedLng = data.longitude !== undefined ? data.longitude : existing.longitude;
    const updatedRadius = data.radius_meters !== undefined ? data.radius_meters : existing.radius_meters;
    const updatedEndTime = data.end_time !== undefined ? data.end_time : existing.end_time;

    this.databaseService.run(
      `UPDATE measurement_sessions 
       SET name = ?, description = ?, latitude = ?, longitude = ?, radius_meters = ?, end_time = ?
       WHERE id = ?`,
      [updatedName, updatedDesc, updatedLat, updatedLng, updatedRadius, updatedEndTime, id],
    );

    return this.databaseService
      .query(`SELECT *, session_id AS id FROM gold_session_metrics WHERE session_id = ?`)
      .get(id) as Record<string, any>;
  }

  /**
   * Elimina una sesión y desasocia sus telemetrías
   */
  deleteSession(id: string) {
    const existing = this.databaseService
      .query(`SELECT id FROM measurement_sessions WHERE id = ?`)
      .get(id);

    if (!existing) {
      return false;
    }

    this.databaseService.run(
      `UPDATE silver_telemetry SET session_id = NULL WHERE session_id = ?`,
      [id],
    );

    this.databaseService.run(
      `DELETE FROM measurement_sessions WHERE id = ?`,
      [id],
    );

    return true;
  }

  /**
   * Obtiene todas las sesiones con métricas de calidad de aire agregadas (Gold View)
   */
  getSessions() {
    return this.databaseService
      .query(`SELECT *, session_id AS id FROM gold_session_metrics ORDER BY start_time DESC`)
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
