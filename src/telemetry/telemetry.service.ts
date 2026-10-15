import { Injectable, Logger } from '@nestjs/common';
import { TelemetryRepository } from './telemetry.repository';
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
  private latestLivePayload: EnrichedTelemetryPayload | null = null;

  constructor(
    private readonly telemetryRepository: TelemetryRepository,
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
   * Procesa la telemetría IoT entrante, delega persistencia al repositorio y emite vía WebSocket
   */
  processAndBroadcast(data: TelemetryIngestDto, source: 'hardware' | 'simulator' = 'hardware'): EnrichedTelemetryPayload {
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
      device_emotion: data.device_emotion || data.emotion,
      view_mode: data.view_mode,
      raw_adc7: data.raw_adc7 ?? data.mq7_raw,
      mpu_connected: data.mpu_connected,
      eye_x: data.eye_x,
      eye_y: data.eye_y,
      free_heap: data.free_heap,
      uptime_s: data.uptime_s,
      offline_pending: data.offline_pending,
    };

    this.latestLivePayload = broadcastData;
    this.telemetryGateway.broadcastTelemetry(broadcastData);
    return broadcastData;
  }

  /**
   * Lógica matemática y analítica del motor predictivo
   */
  processTelemetry(data: TelemetryIngestDto): PredictionResult {
    if (data.timestamp < 946684800000) {
      data.timestamp = Date.now();
    }

    // 1. Guardar en Capa Bronze (Inmutable Data Lake) vía repositorio
    this.telemetryRepository.insertBronze(data);

    // 2. Asociar a una sesión activa en esa ventana temporal
    const activeSession = this.telemetryRepository.findActiveSession(data.device_id, data.timestamp);
    const sessionId = activeSession ? activeSession.id : null;

    // 3. Obtener últimas 10 muestras (ventana deslizante) hasta el timestamp de la muestra actual
    const recentRows = this.telemetryRepository.getRecentBronzeSamples(data.device_id, data.timestamp, 10);

    let delta1m = data.delta_ppm;
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

    // 4. Modelo Predictivo Exponencial con Amortiguamiento
    const attenuation = 0.65;
    const rawPredicted15m = Math.round(data.ppm + delta1m * 15.0 * attenuation);
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

    // 6. Guardar en Capa Silver vía repositorio
    this.telemetryRepository.insertSilver({
      device_id: data.device_id,
      session_id: sessionId,
      timestamp: data.timestamp,
      ppm: data.ppm,
      co_ppm: data.co_ppm,
      temperature: data.temperature,
      humidity: data.humidity,
      delta_ppm_1m: delta1m,
      predicted_ppm_15m: predicted15m,
      risk_status: riskStatus,
    });

    return {
      predicted_ppm_15m: predicted15m,
      delta_ppm_1m: delta1m,
      risk_status: riskStatus,
      session_id: sessionId,
    };
  }

  /**
   * Ingesta y procesa un lote de telemetría (Offline Flush) de forma atómica y ordenada cronológicamente
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

    // Ordenar cronológicamente ascendente para cálculo estricto de derivada temporal
    const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);

    // Delegar transacción atómica SQLite WAL al repositorio
    const enrichedList = this.telemetryRepository.executeBatchTransaction(sorted, source);

    this.logger.log(`📥 Lote procesado: ${enrichedList.length} muestras persistidas en Bronze/Silver.`);

    // Difundir en WebSocket tanto el lote como la muestra más reciente
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
    const row = this.telemetryRepository.getLiveTelemetry();
    if (!row) return this.latestLivePayload;
    if (this.latestLivePayload && this.latestLivePayload.timestamp === row.timestamp) {
      return { ...this.latestLivePayload, ...row };
    }
    return row;
  }

  /**
   * Recupera histórico de series temporales con filtros
   */
  getHistory(filters: QueryHistoryDto) {
    return this.telemetryRepository.getHistory(filters);
  }
}
