import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TelemetryGateway } from './telemetry.gateway';
import type {
  TelemetryIngestDto,
  QueryHistoryDto,
  PredictionResult,
  EnrichedTelemetryPayload,
  BatchIngestResult,
  RiskStatus,
} from './dto/telemetry.dto';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private pendingCommands: Record<string, { view_mode?: 'FACE' | 'HUD'; emotion?: string; timestamp: number }> = {};

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly telemetryGateway: TelemetryGateway,
  ) {
    // Vincular receptor de lotes por WebSocket de forma desacoplada
    this.telemetryGateway.setBatchHandler((samples) =>
      this.processTelemetryBatch(samples, 'hardware'),
    );
  }

  /**
   * Encola un comando pendiente para ser recogido por el ESP32 en su siguiente ingest
   */
  queueCommand(deviceId: string, command: { view_mode?: 'FACE' | 'HUD'; emotion?: string }) {
    const existing = this.pendingCommands[deviceId] || { timestamp: Date.now() };
    this.pendingCommands[deviceId] = {
      ...existing,
      ...command,
      timestamp: Date.now(),
    };
    this.logger.log(`⚡ Comando encolado para [${deviceId}]: ${JSON.stringify(command)}`);
    return this.pendingCommands[deviceId];
  }

  /**
   * Extrae y elimina el comando pendiente para un dispositivo (consumo atómico)
   */
  consumeCommand(deviceId: string) {
    const pending = this.pendingCommands[deviceId];
    if (pending) {
      delete this.pendingCommands[deviceId];
      return pending;
    }
    return null;
  }

  /**
   * Difunde un comando inmediatamente por WebSocket para sincronización instantánea de la UI
   */
  broadcastCommand(deviceId: string, command: { view_mode?: 'FACE' | 'HUD'; emotion?: string }) {
    const live = this.getLiveTelemetry();
    this.telemetryGateway.broadcastTelemetry({
      device_id: deviceId,
      timestamp: Date.now(),
      timestamp_iso: new Date().toISOString(),
      ppm: live?.ppm ?? 420,
      co_ppm: live?.co_ppm ?? 2.1,
      temperature: live?.temperature ?? 24.5,
      humidity: live?.humidity ?? 55,
      delta_ppm_1m: live?.delta_ppm_1m ?? 0,
      predicted_ppm_15m: live?.predicted_ppm_15m ?? 420,
      risk_status: live?.risk_status ?? 'OPTIMAL',
      source: 'hardware',
      view_mode: command.view_mode,
      device_emotion: command.emotion,
      emotion: command.emotion,
    });
  }

  /**
   * Procesa la telemetría IoT entrante, almacena en Bronze/Silver y emite vía WebSocket
   */
  processAndBroadcast(data: TelemetryIngestDto, source: 'hardware' | 'simulator' = 'hardware'): EnrichedTelemetryPayload {
    // Si el timestamp del ESP32 es relativo a millis() (< año 2000), sincronizar con hora de llegada
    if (data.timestamp < 946684800000) {
      data.timestamp = Date.now();
    }

    const prediction = this.processTelemetry(data);

    const broadcastData: EnrichedTelemetryPayload = {
      ...data,
      predicted_ppm_15m: prediction.predicted_ppm_15m,
      delta_ppm_1m: prediction.delta_ppm_1m,
      risk_status: prediction.risk_status,
      session_id: prediction.session_id,
      timestamp_iso: new Date(data.timestamp).toISOString(),
      source,
      device_emotion: data.emotion,
      view_mode: data.view_mode,
      raw_adc7: data.raw_adc7,
      mpu_connected: data.mpu_connected,
      eye_x: data.eye_x,
      eye_y: data.eye_y,
      free_heap: data.free_heap,
      uptime_s: data.uptime_s,
      offline_pending: data.offline_pending,
    };

    this.telemetryGateway.broadcastTelemetry(broadcastData);
    return broadcastData;
  }

  /**
   * Lógica matemática y analítica del motor predictivo
   */
  processTelemetry(data: TelemetryIngestDto): PredictionResult {
    // Si el timestamp es relativo a millis() del ESP32 (< año 2000), mapear a hora real del servidor
    if (data.timestamp < 946684800000) {
      data.timestamp = Date.now();
    }

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

    // 3. Obtener últimas 10 muestras (ventana deslizante) hasta el timestamp de la muestra actual
    const recentRows = this.databaseService
      .query(
        `SELECT ppm, timestamp FROM bronze_telemetry 
         WHERE device_id = ? AND timestamp <= ?
         ORDER BY timestamp DESC LIMIT 10`,
      )
      .all(data.device_id, data.timestamp) as Array<{ ppm: number; timestamp: number }>;

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
   * Ingesta y procesa un lote de telemetría (Offline Flush) de forma atómica y ordenada cronológicamente.
   * Preserva el timestamp original de cada muestra y calcula la derivada temporal sin sesgos.
   */
  processTelemetryBatch(
    samples: TelemetryIngestDto[],
    source: 'hardware' | 'simulator' = 'hardware',
  ): BatchIngestResult {
    if (!samples || samples.length === 0) {
      return {
        total_received: 0,
        total_processed: 0,
        first_timestamp: null,
        last_timestamp: null,
        device_id: 'air-guardian-01',
        samples: [],
      };
    }

    // 1. Ordenar cronológicamente ascendente para cálculo estricto de derivada temporal
    const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
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
      for (const item of sorted) {
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

    this.logger.log(`📥 Lote procesado: ${enrichedList.length} muestras persistidas en Bronze/Silver.`);

    // F. Difundir en WebSocket tanto el lote como la muestra más reciente
    this.telemetryGateway.broadcastBatch(enrichedList);
    if (enrichedList.length > 0) {
      const latest = enrichedList[enrichedList.length - 1];
      this.telemetryGateway.broadcastTelemetry(latest);
    }

    return {
      total_received: samples.length,
      total_processed: enrichedList.length,
      first_timestamp: enrichedList.length ? enrichedList[0].timestamp : null,
      last_timestamp: enrichedList.length ? enrichedList[enrichedList.length - 1].timestamp : null,
      device_id: sorted[0]?.device_id || 'air-guardian-01',
      samples: enrichedList,
    };
  }

  /**
   * Obtiene la última lectura en vivo almacenada en Silver
   */
  getLiveTelemetry() {
    return this.databaseService
      .query(`SELECT * FROM silver_telemetry ORDER BY id DESC LIMIT 1`)
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
