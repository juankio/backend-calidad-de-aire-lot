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
  raw_adc: z.number().int().min(0).max(4095),
});

// Validación para consulta de series temporales
export const QueryHistorySchema = z.object({
  device_id: z.string().max(64).optional(),
  session_id: z.string().max(64).optional(),
  start_time: z.coerce.number().int().positive().optional(),
  end_time: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export type TelemetryIngestDto = z.infer<typeof TelemetryIngestSchema>;
export type QueryHistoryDto = z.infer<typeof QueryHistorySchema>;

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
}
