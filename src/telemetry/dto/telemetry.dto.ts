import { z } from 'zod';

// Validación estricta para la ingesta de telemetría IoT
export const TelemetryIngestSchema = z.object({
  device_id: z.string().min(1).max(64),
  timestamp: z.number().int().positive(),
  ppm: z.number().min(0).max(10000),
  co_ppm: z.number().min(0).max(2000),
  temperature: z.number().min(-40).max(85),
  humidity: z.number().min(0).max(100),
  delta_ppm: z.number().default(0),
  raw_adc: z.number().int().min(0).max(4095).default(0),
  emotion: z.string().optional(),
  view_mode: z.union([z.literal('FACE'), z.literal('HUD'), z.string()]).optional(),
  raw_adc7: z.number().optional(),
  mpu_connected: z.boolean().optional(),
  eye_x: z.number().optional(),
  eye_y: z.number().optional(),
  free_heap: z.number().optional(),
  uptime_s: z.number().optional(),
  offline_pending: z.number().optional(),
});

// Muestra individual dentro de un lote (device_id puede heredarse del contenedor)
export const SingleBatchSampleSchema = z.object({
  device_id: z.string().min(1).max(64).optional(),
  timestamp: z.number().int().positive(),
  ppm: z.number().min(0).max(10000),
  co_ppm: z.number().min(0).max(2000),
  temperature: z.number().min(-40).max(85),
  humidity: z.number().min(0).max(100),
  delta_ppm: z.number().default(0),
  raw_adc: z.number().int().min(0).max(4095).default(0),
  emotion: z.string().optional(),
  view_mode: z.union([z.literal('FACE'), z.literal('HUD'), z.string()]).optional(),
  raw_adc7: z.number().optional(),
  mpu_connected: z.boolean().optional(),
  eye_x: z.number().optional(),
  eye_y: z.number().optional(),
  free_heap: z.number().optional(),
  uptime_s: z.number().optional(),
  offline_pending: z.number().optional(),
});

// Validación para ingesta por lotes / offline flush (array directo u objeto contenedor)
export const TelemetryBatchSchema = z.union([
  z
    .array(TelemetryIngestSchema)
    .min(1, 'El lote debe contener al menos 1 muestra')
    .max(1000, 'Máximo 1000 muestras por lote'),
  z
    .object({
      device_id: z.string().min(1).max(64).optional(),
      samples: z
        .array(SingleBatchSampleSchema)
        .min(1, 'El lote debe contener al menos 1 muestra')
        .max(1000, 'Máximo 1000 muestras por lote'),
    })
    .transform((obj) => {
      const fallbackId = obj.device_id || 'air-guardian-01';
      return obj.samples.map((s) => ({
        ...s,
        device_id: s.device_id || fallbackId,
      })) as TelemetryIngestDto[];
    }),
  z
    .object({
      device_id: z.string().min(1).max(64).optional(),
      items: z
        .array(SingleBatchSampleSchema)
        .min(1, 'El lote debe contener al menos 1 muestra')
        .max(1000, 'Máximo 1000 muestras por lote'),
    })
    .transform((obj) => {
      const fallbackId = obj.device_id || 'air-guardian-01';
      return obj.items.map((s) => ({
        ...s,
        device_id: s.device_id || fallbackId,
      })) as TelemetryIngestDto[];
    }),
  z
    .object({
      device_id: z.string().min(1).max(64).optional(),
      batch: z
        .array(SingleBatchSampleSchema)
        .min(1, 'El lote debe contener al menos 1 muestra')
        .max(1000, 'Máximo 1000 muestras por lote'),
    })
    .transform((obj) => {
      const fallbackId = obj.device_id || 'air-guardian-01';
      return obj.batch.map((s) => ({
        ...s,
        device_id: s.device_id || fallbackId,
      })) as TelemetryIngestDto[];
    }),
]);

// Validación para consulta de series temporales
export const QueryHistorySchema = z.object({
  device_id: z.string().max(64).optional(),
  session_id: z.string().max(64).optional(),
  start_time: z.coerce.number().int().positive().optional(),
  end_time: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

// Validación para comandos hacia el dispositivo o interfaz
export const TelemetryCommandSchema = z.object({
  device_id: z.string().max(64).optional(),
  view_mode: z.union([z.literal('FACE'), z.literal('HUD'), z.string()]).optional(),
  emotion: z.string().optional(),
});

export type TelemetryIngestDto = z.infer<typeof TelemetryIngestSchema>;
export type TelemetryBatchDto = TelemetryIngestDto[];
export type QueryHistoryDto = z.infer<typeof QueryHistorySchema>;
export type TelemetryCommandDto = z.infer<typeof TelemetryCommandSchema>;

export type RiskStatus = 'OPTIMAL' | 'WARNING_PREDICTIVE' | 'CRITICAL' | 'RECOVERY';

export interface PredictionResult {
  predicted_ppm_15m: number;
  delta_ppm_1m: number;
  risk_status: RiskStatus;
  session_id: string | null;
}

export interface EnrichedTelemetryPayload extends TelemetryIngestDto {
  predicted_ppm_15m: number;
  delta_ppm_1m: number;
  risk_status: RiskStatus;
  session_id: string | null;
  timestamp_iso: string;
  source: 'hardware' | 'simulator';
  device_emotion?: string;
  view_mode?: 'FACE' | 'HUD' | string;
  raw_adc7?: number;
  mpu_connected?: boolean;
  eye_x?: number;
  eye_y?: number;
  free_heap?: number;
  uptime_s?: number;
  offline_pending?: number;
}

export interface BatchIngestResult {
  total_received: number;
  total_processed: number;
  first_timestamp: number | null;
  last_timestamp: number | null;
  device_id: string;
  samples: EnrichedTelemetryPayload[];
}
