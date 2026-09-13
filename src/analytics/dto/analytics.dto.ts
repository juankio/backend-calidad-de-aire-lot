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
  data: Array<Record<string, any>> | string;
}

// =========================================================================
// ECUACIONES DIFERENCIALES & ANÁLISIS NUMÉRICO (UNIVERSIDAD)
// =========================================================================

export const NumericalAnalysisQuerySchema = z.object({
  c0: z.coerce.number().min(0).max(10000).optional().default(420),
  c_inf: z.coerce.number().min(0).max(10000).optional().default(1100),
  k: z.coerce.number().positive().max(5).optional().default(0.08),
  duration: z.coerce.number().positive().max(300).optional().default(30),
  h: z.coerce.number().positive().max(20).optional().default(1.0),
});
export type NumericalAnalysisQueryDto = z.infer<typeof NumericalAnalysisQuerySchema>;

export interface NumericalStep {
  n: number;
  t: number;
  exact: number;
  euler: number;
  rk4: number;
  error_abs_euler: number;
  error_rel_euler_pct: number;
  error_abs_rk4: number;
  error_rel_rk4_pct: number;
}

export interface NumericalMethodSummary {
  mae: number;
  rmse: number;
  max_error: number;
  mean_rel_error_pct: number;
}

export interface DifferentialEquationResult {
  formulation: {
    ode_latex: string;
    integrating_factor_latex: string;
    analytical_solution_latex: string;
    physical_variables: {
      c0: number;
      c_inf: number;
      k: number;
      h: number;
      duration_minutes: number;
    };
    stability_analysis: {
      critical_step_h: number;
      is_euler_stable: boolean;
      lipschitz_constant: number;
      stability_message: string;
    };
  };
  metrics: {
    euler: NumericalMethodSummary;
    rk4: NumericalMethodSummary;
    rk4_accuracy_boost_factor: number;
  };
  steps: NumericalStep[];
  latex_table_snippet: string;
}
