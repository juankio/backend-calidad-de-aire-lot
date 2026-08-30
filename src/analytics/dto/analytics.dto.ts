import { z } from 'zod';

export const DataLakeLayerSchema = z.enum(['bronze', 'silver', 'gold']);
export type DataLakeLayer = z.infer<typeof DataLakeLayerSchema>;

export const ExportFormatSchema = z.enum(['json', 'csv']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const ExportQuerySchema = z.object({
  format: ExportFormatSchema.optional().default('json'),
  limit: z.coerce.number().int().positive().max(10000).optional(),
});
export type ExportQueryDto = z.infer<typeof ExportQuerySchema>;

export interface PearsonCorrelationPair {
  var1: string;
  var2: string;
  coefficient: number;
  strength: 'very_strong' | 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative' | 'neutral';
  description: string;
}

export interface CorrelationMatrixResult {
  variables: string[];
  matrix: number[][];
  pairs: PearsonCorrelationPair[];
  sample_size: number;
  source: 'silver_telemetry' | 'silver_telemetry_augmented';
  insights: string[];
}

export interface ModelMetrics {
  r2: number;
  rmse: number;
  mae: number;
  mape: number;
}

export interface ModelEvaluationItem {
  id: 'damped_exponential' | 'xgboost_regressor' | 'holt_winters';
  name: string;
  architecture: string;
  status: 'production' | 'candidate' | 'benchmark';
  metrics: ModelMetrics;
  inference_latency_ms: number;
  features_used: string[];
  description: string;
  pros: string;
  cons: string;
}

export interface ModelEvaluationResult {
  target_variable: string;
  prediction_horizon_minutes: number;
  sample_count: number;
  evaluation_date: string;
  models: ModelEvaluationItem[];
  comparison_summary: {
    best_overall_model: string;
    best_r2_model: string;
    lowest_rmse_model: string;
    lowest_latency_model: string;
    production_recommendation: string;
  };
}

export interface ExportDataLakeResult {
  layer: DataLakeLayer;
  format: ExportFormat;
  record_count: number;
  data: any;
}
