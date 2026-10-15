import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateSessionDto, UpdateSessionDto } from './dto/session.dto';

@Injectable()
export class SessionsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Inserta una nueva sesión de medición
   */
  create(id: string, data: CreateSessionDto): Record<string, any> {
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

    return this.findById(id) as Record<string, any>;
  }

  /**
   * Busca una sesión por ID en la tabla base
   */
  findById(id: string): Record<string, any> | null {
    return this.databaseService
      .query(`SELECT * FROM measurement_sessions WHERE id = ?`)
      .get(id) as Record<string, any> | null;
  }

  /**
   * Busca una sesión por ID en la vista agregada Gold
   */
  findGoldMetricsById(id: string): Record<string, any> | null {
    return this.databaseService
      .query(`SELECT *, session_id AS id FROM gold_session_metrics WHERE session_id = ?`)
      .get(id) as Record<string, any> | null;
  }

  /**
   * Actualiza los datos de una campaña de medición existente
   */
  update(id: string, fields: {
    name: string;
    description: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    end_time: number | null;
  }): Record<string, any> | null {
    this.databaseService.run(
      `UPDATE measurement_sessions 
       SET name = ?, description = ?, latitude = ?, longitude = ?, radius_meters = ?, end_time = ?
       WHERE id = ?`,
      [
        fields.name,
        fields.description,
        fields.latitude,
        fields.longitude,
        fields.radius_meters,
        fields.end_time,
        id,
      ],
    );

    return this.findGoldMetricsById(id);
  }

  /**
   * Desasocia telemetrías y elimina la sesión
   */
  delete(id: string): boolean {
    const existing = this.findById(id);
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
   * Obtiene todas las sesiones con métricas agregadas desde la vista Gold
   */
  findAllGold(): Array<Record<string, any>> {
    return this.databaseService
      .query(`SELECT *, session_id AS id FROM gold_session_metrics ORDER BY start_time DESC`)
      .all() as Array<Record<string, any>>;
  }

  /**
   * Obtiene puntos geoespaciales para el mapa de calor
   */
  getHeatmapPoints(): Array<Record<string, any>> {
    return this.databaseService
      .query(
        `SELECT session_id, name, latitude, longitude, radius_meters, avg_ppm, max_ppm, total_samples as sample_count
         FROM gold_session_metrics
         WHERE total_samples > 0`,
      )
      .all() as Array<Record<string, any>>;
  }
}
