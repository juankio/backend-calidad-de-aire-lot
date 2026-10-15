import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  TelemetryIngestDto,
  QueryHistoryDto,
  EnrichedTelemetryPayload,
  RiskStatus,
} from './dto/telemetry.dto';

@Injectable()
export class TelemetryRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Inserta un registro inmutable en la Capa Bronze (Raw Data Lake)
   */
  insertBronze(data: TelemetryIngestDto): void {
    this.databaseService.run(
      `INSERT INTO bronze_telemetry (device_id, timestamp, ppm, co_ppm, temperature, humidity, delta_ppm, raw_adc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.device_id,
        data.timestamp,
        data.ppm,
        data.co_ppm,
        data.temperature,
        data.humidity,
        data.delta_ppm,
        data.raw_adc,
      ],
    );
  }

  /**
   * Busca si existe una sesión activa para el dispositivo en una ventana temporal dada
   */
  findActiveSession(deviceId: string, timestamp: number): { id: string } | null {
    return this.databaseService
      .query(
        `SELECT id FROM measurement_sessions 
         WHERE device_id = ? 
           AND start_time <= ? 
           AND (end_time IS NULL OR end_time >= ?)
         ORDER BY start_time DESC LIMIT 1`,
      )
      .get(deviceId, timestamp, timestamp) as { id: string } | null;
  }

  /**
   * Obtiene las muestras más recientes de la Capa Bronze para cálculo de derivada móvil
   */
  getRecentBronzeSamples(
    deviceId: string,
    timestamp: number,
    limit = 10,
  ): Array<{ ppm: number; timestamp: number }> {
    return this.databaseService
      .query(
        `SELECT ppm, timestamp FROM bronze_telemetry 
         WHERE device_id = ? AND timestamp <= ?
         ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(deviceId, timestamp, limit) as Array<{ ppm: number; timestamp: number }>;
  }

  /**
   * Inserta un registro enriquecido en la Capa Silver (Data Warehouse)
   */
  insertSilver(record: {
    device_id: string;
    session_id: string | null;
    timestamp: number;
    ppm: number;
    co_ppm: number;
    temperature: number;
    humidity: number;
    delta_ppm_1m: number;
    predicted_ppm_15m: number;
    risk_status: RiskStatus;
  }): void {
    this.databaseService.run(
      `INSERT INTO silver_telemetry (device_id, session_id, timestamp, ppm, co_ppm, temperature, humidity, delta_ppm_1m, predicted_ppm_15m, risk_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.device_id,
        record.session_id,
        record.timestamp,
        record.ppm,
        record.co_ppm,
        record.temperature,
        record.humidity,
        record.delta_ppm_1m,
        record.predicted_ppm_15m,
        record.risk_status,
      ],
    );
  }

  /**
   * Ejecuta la ingesta atómica por lotes (Bronze + Silver) dentro de una transacción SQLite WAL
   */
  executeBatchTransaction(
    sortedSamples: TelemetryIngestDto[],
    source: 'hardware' | 'simulator' = 'hardware',
  ): EnrichedTelemetryPayload[] {
    const db = this.databaseService.getDb();

    const insertBronze = db.prepare(`
      INSERT INTO bronze_telemetry (device_id, timestamp, ppm, co_ppm, temperature, humidity, delta_ppm, raw_adc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const selectSession = db.prepare(`
      SELECT id FROM measurement_sessions 
      WHERE device_id = ? 
        AND start_time <= ? 
        AND (end_time IS NULL OR end_time >= ?)
      ORDER BY start_time DESC LIMIT 1
    `);

    const selectRecent = db.prepare(`
      SELECT ppm, timestamp FROM bronze_telemetry 
      WHERE device_id = ? AND timestamp <= ?
      ORDER BY timestamp DESC LIMIT 10
    `);

    const insertSilver = db.prepare(`
      INSERT INTO silver_telemetry (device_id, session_id, timestamp, ppm, co_ppm, temperature, humidity, delta_ppm_1m, predicted_ppm_15m, risk_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const enrichedList: EnrichedTelemetryPayload[] = [];
    const attenuation = 0.65;

    const batchTx = db.transaction(() => {
      for (const item of sortedSamples) {
        // A. Insertar en Bronze
        insertBronze.run(
          item.device_id,
          item.timestamp,
          item.ppm,
          item.co_ppm,
          item.temperature,
          item.humidity,
          item.delta_ppm,
          item.raw_adc,
        );

        // B. Asociar sesión temporal
        const activeSession = selectSession.get(
          item.device_id,
          item.timestamp,
          item.timestamp,
        ) as { id: string } | null;
        const sessionId = activeSession ? activeSession.id : null;

        // C. Ventana temporal hasta este punto
        const recentRows = selectRecent.all(
          item.device_id,
          item.timestamp,
        ) as Array<{ ppm: number; timestamp: number }>;

        let delta1m = item.delta_ppm;
        if (recentRows.length >= 2) {
          const newest = recentRows[0];
          const oldest = recentRows[recentRows.length - 1];
          if (newest && oldest && newest.timestamp > oldest.timestamp) {
            const timeDiffMin = (newest.timestamp - oldest.timestamp) / 60000.0;
            if (timeDiffMin >= 5.0 / 60.0) {
              const rawDelta = (newest.ppm - oldest.ppm) / timeDiffMin;
              delta1m = Math.max(-500, Math.min(500, Math.round(rawDelta * 10) / 10));
            }
          }
        }

        // D. Predicción a 15 min y clasificación
        const rawPred = Math.round(item.ppm + delta1m * 15.0 * attenuation);
        const predicted15m = Math.max(380, Math.min(10000, rawPred));

        let riskStatus: RiskStatus = 'OPTIMAL';
        if (item.co_ppm > 25 || item.ppm > 1400 || predicted15m > 1600) {
          riskStatus = 'CRITICAL';
        } else if (delta1m > 35 || predicted15m > 850 || item.ppm > 800) {
          riskStatus = 'WARNING_PREDICTIVE';
        } else if (delta1m < -30 && item.ppm < 700) {
          riskStatus = 'RECOVERY';
        }

        // E. Insertar en Silver
        insertSilver.run(
          item.device_id,
          sessionId,
          item.timestamp,
          item.ppm,
          item.co_ppm,
          item.temperature,
          item.humidity,
          delta1m,
          predicted15m,
          riskStatus,
        );

        enrichedList.push({
          ...item,
          predicted_ppm_15m: predicted15m,
          delta_ppm_1m: delta1m,
          risk_status: riskStatus,
          session_id: sessionId,
          timestamp_iso: new Date(item.timestamp).toISOString(),
          source,
          device_emotion: item.emotion,
          view_mode: item.view_mode,
          raw_adc7: item.raw_adc7,
          mpu_connected: item.mpu_connected,
          eye_x: item.eye_x,
          eye_y: item.eye_y,
          free_heap: item.free_heap,
          uptime_s: item.uptime_s,
          offline_pending: item.offline_pending,
        });
      }
    });

    batchTx();
    return enrichedList;
  }

  /**
   * Obtiene la última lectura registrada en la Capa Silver
   */
  getLiveTelemetry(): Record<string, any> | null {
    return this.databaseService
      .query(`SELECT * FROM silver_telemetry ORDER BY id DESC LIMIT 1`)
      .get() as Record<string, any> | null;
  }

  /**
   * Recupera histórico de series temporales con filtros
   */
  getHistory(filters: QueryHistoryDto): Array<Record<string, any>> {
    const { device_id, session_id, start_time, end_time, limit } = filters;
    let query = `SELECT * FROM silver_telemetry WHERE 1=1`;
    const params: any[] = [];

    if (device_id) {
      query += ` AND device_id = ?`;
      params.push(device_id);
    }
    if (session_id) {
      query += ` AND session_id = ?`;
      params.push(session_id);
    }
    if (start_time !== undefined) {
      query += ` AND timestamp >= ?`;
      params.push(start_time);
    }
    if (end_time !== undefined) {
      query += ` AND timestamp <= ?`;
      params.push(end_time);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const rows = this.databaseService.query(query).all(...params) as Array<Record<string, any>>;
    return rows.reverse();
  }
}
