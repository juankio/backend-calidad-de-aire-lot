import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TelemetryGateway } from './telemetry.gateway';
import type {
  TelemetryIngestDto,
  QueryHistoryDto,
  PredictionResult,
  EnrichedTelemetryPayload,
  RiskStatus,
} from './dto/telemetry.dto';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly telemetryGateway: TelemetryGateway,
  ) {}

  /**
   * Procesa la telemetría IoT entrante, almacena en Bronze/Silver y emite vía WebSocket
   */
  processAndBroadcast(data: TelemetryIngestDto): EnrichedTelemetryPayload {
    const prediction = this.processTelemetry(data);

    const broadcastData: EnrichedTelemetryPayload = {
      ...data,
      predicted_ppm_15m: prediction.predicted_ppm_15m,
      delta_ppm_1m: prediction.delta_ppm_1m,
      risk_status: prediction.risk_status,
      session_id: prediction.session_id,
      timestamp_iso: new Date(data.timestamp).toISOString(),
    };

    this.telemetryGateway.broadcastTelemetry(broadcastData);
    return broadcastData;
  }

  /**
   * Lógica matemática y analítica del motor predictivo
   */
  processTelemetry(data: TelemetryIngestDto): PredictionResult {
    // 1. Guardar en Capa Bronze (Inmutable Data Lake)
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

    // 2. Asociar a una sesión activa en esa ventana temporal
    const activeSession = this.databaseService
      .query(
        `SELECT id FROM measurement_sessions 
         WHERE device_id = ? 
           AND start_time <= ? 
           AND (end_time IS NULL OR end_time >= ?)
         ORDER BY start_time DESC LIMIT 1`,
      )
      .get(data.device_id, data.timestamp, data.timestamp) as { id: string } | null;

    const sessionId = activeSession ? activeSession.id : null;

    // 3. Obtener últimas 10 muestras (ventana deslizante) para calcular inercia y derivada temporal
    const recentRows = this.databaseService
      .query(
        `SELECT ppm, timestamp FROM bronze_telemetry 
         WHERE device_id = ? 
         ORDER BY timestamp DESC LIMIT 10`,
      )
      .all(data.device_id) as Array<{ ppm: number; timestamp: number }>;

    let delta1m = data.delta_ppm;
    if (recentRows.length >= 2) {
      const newest = recentRows[0];
      const oldest = recentRows[recentRows.length - 1];
      if (newest && oldest && newest.timestamp > oldest.timestamp) {
        const timeDiffMin = (newest.timestamp - oldest.timestamp) / 60000.0;
        // Evitar división por valores infinitesimales (mínimo 5 segundos de ventana)
        if (timeDiffMin >= 5.0 / 60.0) {
          const rawDelta = (newest.ppm - oldest.ppm) / timeDiffMin;
          // Filtrado de picos de ruido (clamp a +-500 ppm/min)
          delta1m = Math.max(-500, Math.min(500, Math.round(rawDelta * 10) / 10));
        }
      }
    }

    // 4. Modelo Predictivo Exponencial con Amortiguamiento
    // Predecir PPM en t + 15 min: P(t+15) = P(t) + delta * 15 * factor_atenuacion
    const attenuation = 0.65; // Factor de dispersión natural en recintos
    const rawPredicted15m = Math.round(data.ppm + delta1m * 15.0 * attenuation);
    // Clamping físico estricto (mínimo 380 ppm base ambiental, máximo 10,000 ppm límite sensor)
    const predicted15m = Math.max(380, Math.min(10000, rawPredicted15m));

    // 5. Matriz de Clasificación de Riesgo Predictivo
    let riskStatus: RiskStatus = 'OPTIMAL';

    if (data.co_ppm > 25 || data.ppm > 1400 || predicted15m > 1600) {
      riskStatus = 'CRITICAL';
    } else if (delta1m > 35 || predicted15m > 850 || data.ppm > 800) {
      riskStatus = 'WARNING_PREDICTIVE';
    } else if (delta1m < -30 && data.ppm < 700) {
      riskStatus = 'RECOVERY';
    } else {
      riskStatus = 'OPTIMAL';
    }

    // 6. Guardar en Capa Silver (Data Warehouse Enriquecido)
    this.databaseService.run(
      `INSERT INTO silver_telemetry (device_id, session_id, timestamp, ppm, co_ppm, temperature, humidity, delta_ppm_1m, predicted_ppm_15m, risk_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.device_id,
        sessionId,
        data.timestamp,
        data.ppm,
        data.co_ppm,
        data.temperature,
        data.humidity,
        delta1m,
        predicted15m,
        riskStatus,
      ],
    );

    return {
      predicted_ppm_15m: predicted15m,
      delta_ppm_1m: delta1m,
      risk_status: riskStatus,
      session_id: sessionId,
    };
  }

  /**
   * Obtiene la última lectura en vivo almacenada en Silver
   */
  getLiveTelemetry() {
    return this.databaseService
      .query(`SELECT * FROM silver_telemetry ORDER BY timestamp DESC LIMIT 1`)
      .get() as Record<string, any> | null;
  }

  /**
   * Recupera histórico de series temporales con filtros
   */
  getHistory(filters: QueryHistoryDto) {
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
