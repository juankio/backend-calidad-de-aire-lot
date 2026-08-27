import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import type { INestApplication } from '@nestjs/common';
import { WebSocket } from 'ws';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TelemetryIngestSchema, CreateSessionSchema } from './schemas';
import { PredictiveEngine } from './predictive_engine';
import { AnalyticsService } from './analytics/analytics.service';

describe('Air Guardian IoT - Schemas & Validation', () => {
  it('valida telemetría correcta', () => {
    const valid = {
      device_id: 'air-guardian-01',
      timestamp: Date.now(),
      ppm: 420,
      co_ppm: 2.5,
      temperature: 24.0,
      humidity: 55.0,
      delta_ppm: 0,
      raw_adc: 630,
    };
    const res = TelemetryIngestSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('rechaza telemetría con valores fuera de rango físico', () => {
    const invalid = {
      device_id: '',
      timestamp: -100,
      ppm: 15000, // max 10000
      co_ppm: -5,
      temperature: 150, // max 85
      humidity: 150,
      raw_adc: 5000, // max 4095
    };
    const res = TelemetryIngestSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('valida sesiones geográficas con coordenadas válidas', () => {
    const validSession = {
      name: 'Parque Metropolitano',
      latitude: 4.6583,
      longitude: -74.0935,
      radius_meters: 100,
      start_time: Date.now(),
    };
    const res = CreateSessionSchema.safeParse(validSession);
    expect(res.success).toBe(true);
  });

  it('rechaza sesiones con end_time menor que start_time', () => {
    const invalidSession = {
      name: 'Parque Invalido',
      latitude: 4.6583,
      longitude: -74.0935,
      radius_meters: 100,
      start_time: 2000,
      end_time: 1000,
    };
    const res = CreateSessionSchema.safeParse(invalidSession);
    expect(res.success).toBe(false);
  });
});

describe('Air Guardian IoT - Predictive Engine & Classifications', () => {
  it('clasifica como CRITICAL si CO > 25 ppm o PPM > 1400', () => {
    const resultHighCO = PredictiveEngine.processTelemetry({
      device_id: 'test-crit-01',
      timestamp: Date.now(),
      ppm: 500,
      co_ppm: 30, // > 25
      temperature: 25,
      humidity: 60,
      delta_ppm: 0,
      raw_adc: 750,
    });
    expect(resultHighCO.risk_status).toBe('CRITICAL');

    const resultHighPPM = PredictiveEngine.processTelemetry({
      device_id: 'test-crit-02',
      timestamp: Date.now(),
      ppm: 1500, // > 1400
      co_ppm: 5,
      temperature: 25,
      humidity: 60,
      delta_ppm: 0,
      raw_adc: 2250,
    });
    expect(resultHighPPM.risk_status).toBe('CRITICAL');
  });

  it('clasifica como WARNING_PREDICTIVE si PPM > 800 o delta > 35', () => {
    const resultWarning = PredictiveEngine.processTelemetry({
      device_id: 'test-warn-01',
      timestamp: Date.now(),
      ppm: 850,
      co_ppm: 2,
      temperature: 23,
      humidity: 50,
      delta_ppm: 40,
      raw_adc: 1200,
    });
    expect(resultWarning.risk_status).toBe('WARNING_PREDICTIVE');
  });

  it('clasifica como OPTIMAL en condiciones estándar de aire limpio', () => {
    const resultOptimal = PredictiveEngine.processTelemetry({
      device_id: 'test-opt-01',
      timestamp: Date.now(),
      ppm: 420,
      co_ppm: 1.5,
      temperature: 22,
      humidity: 50,
      delta_ppm: 0,
      raw_adc: 630,
    });
    expect(resultOptimal.risk_status).toBe('OPTIMAL');
  });
});

describe('Air Guardian IoT - NestJS Backend HTTP & WebSocket Suite', () => {
  const PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : 3099;
  const BASE_URL = `http://localhost:${PORT}`;
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useWebSocketAdapter(new WsAdapter(app));
    app.setGlobalPrefix('api');
    app.enableCors();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(PORT);
  });

  afterAll(async () => {
    if (app) {
      try {
        const httpServer = app.getHttpServer();
        if (httpServer?.closeAllConnections) {
          httpServer.closeAllConnections();
        }
        await app.close();
      } catch (_) {}
    }
  });

  it('GET /api/telemetry/live responde formato estándar con status 200', async () => {
    const res = await fetch(`${BASE_URL}/api/telemetry/live`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json).toHaveProperty('success');
    expect(json).toHaveProperty('data');
    expect(json).toHaveProperty('message');
    expect(json).toHaveProperty('error');
    expect(json.success).toBe(true);
    expect(json.error).toBe(null);
  });

  it('POST /api/sessions crea una campaña correctamente', async () => {
    const newSession = {
      name: `Campaña Test ${Date.now()}`,
      description: 'Prueba automatizada de QA',
      latitude: 4.6097,
      longitude: -74.0817,
      radius_meters: 80,
      start_time: Date.now(),
      device_id: 'air-guardian-01',
    };

    const res = await fetch(`${BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSession),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.name).toBe(newSession.name);
    expect(json.data.latitude).toBe(newSession.latitude);
    expect(json.error).toBe(null);
  });

  it('POST /api/telemetry/ingest ingesta telemetría y calcula predicción', async () => {
    const telemetry = {
      device_id: 'air-guardian-01',
      timestamp: Date.now(),
      ppm: 450,
      co_ppm: 3.2,
      temperature: 23.5,
      humidity: 52.0,
      delta_ppm: 5,
      raw_adc: 675,
    };

    const res = await fetch(`${BASE_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telemetry),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('predicted_ppm_15m');
    expect(json.data).toHaveProperty('risk_status');
    expect(json.error).toBe(null);
  });

  it('POST /api/telemetry/ingest con datos inválidos retorna 400 y formato estándar', async () => {
    const invalidTelemetry = {
      device_id: '',
      timestamp: -1,
      ppm: 99999,
      co_ppm: -10,
    };

    const res = await fetch(`${BASE_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidTelemetry),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.data).toBe(null);
    expect(json.error).toBeDefined();
  });

  it('GET /api/telemetry/history devuelve registros paginados', async () => {
    const res = await fetch(`${BASE_URL}/api/telemetry/history?limit=10`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.error).toBe(null);
  });

  it('GET /api/sessions devuelve agregaciones Gold Layer', async () => {
    const res = await fetch(`${BASE_URL}/api/sessions`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    if (json.data.length > 0) {
      expect(json.data[0]).toHaveProperty('total_samples');
      expect(json.data[0]).toHaveProperty('avg_ppm');
      expect(json.data[0]).toHaveProperty('max_ppm');
    }
  });

  it('GET /api/heatmap devuelve únicamente puntos con muestras', async () => {
    const res = await fetch(`${BASE_URL}/api/heatmap`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    for (const point of json.data) {
      expect(point.sample_count).toBeGreaterThan(0);
    }
  });

  it('POST /api/simulate/toggle activa y desactiva el simulador', async () => {
    // Activar
    const resOn = await fetch(`${BASE_URL}/api/simulate/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: true }),
    });
    expect(resOn.status).toBe(200);
    const jsonOn = (await resOn.json()) as any;
    expect(jsonOn.success).toBe(true);
    expect(jsonOn.data.running).toBe(true);

    // Desactivar
    const resOff = await fetch(`${BASE_URL}/api/simulate/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: false }),
    });
    expect(resOff.status).toBe(200);
    const jsonOff = (await resOff.json()) as any;
    expect(jsonOff.success).toBe(true);
    expect(jsonOff.data.running).toBe(false);
  });

  it('WebSocket recibe CONNECTION_ACK y TELEMETRY_UPDATE en ingesta', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);

    const ackPromise = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'CONNECTION_ACK') {
          resolve(parsed);
        }
      });
    });

    const ackMessage = await ackPromise;
    expect(ackMessage.type).toBe('CONNECTION_ACK');
    expect(ackMessage.message).toBe('Conectado al stream de telemetría IoT');

    // Ahora enviar telemetría por HTTP y verificar broadcast en WebSocket
    const updatePromise = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'TELEMETRY_UPDATE') {
          resolve(parsed);
        }
      });
    });

    const sample = {
      device_id: 'ws-test-device',
      timestamp: Date.now(),
      ppm: 555,
      co_ppm: 4.0,
      temperature: 26.0,
      humidity: 48.0,
      delta_ppm: 2,
      raw_adc: 800,
    };

    await fetch(`${BASE_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    });

    const updateMessage = await updatePromise;
    expect(updateMessage.type).toBe('TELEMETRY_UPDATE');
    expect(updateMessage.payload.device_id).toBe('ws-test-device');
    expect(updateMessage.payload.ppm).toBe(555);

    ws.close();
  });

  // =========================================================================
  // SANJI DATA SCIENCE & ANALYTICS MODULE TESTS
  // =========================================================================

  it('AnalyticsService: calculateCorrelationMatrix calcula matriz 5x5 con propiedades de Pearson', () => {
    const analyticsService = app.get(AnalyticsService);
    const result = analyticsService.calculateCorrelationMatrix();

    expect(result.variables).toEqual([
      'ppm',
      'co_ppm',
      'temperature',
      'humidity',
      'delta_ppm_1m',
    ]);
    expect(result.matrix.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      expect(result.matrix[i][i]).toBe(1.0); // Diagonal unitaria
      for (let j = 0; j < 5; j++) {
        expect(result.matrix[i][j]).toBeGreaterThanOrEqual(-1.0);
        expect(result.matrix[i][j]).toBeLessThanOrEqual(1.0);
        expect(result.matrix[i][j]).toBe(result.matrix[j][i]); // Simétrica
      }
    }

    expect(result.pairs.length).toBe(10);
    expect(result.sample_size).toBeGreaterThanOrEqual(30);
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it('AnalyticsService: calculateModelEvaluationMetrics evalúa los 3 modelos con métricas válidas', () => {
    const analyticsService = app.get(AnalyticsService);
    const result = analyticsService.calculateModelEvaluationMetrics();

    expect(result.target_variable).toBe('ppm_forecast_15m');
    expect(result.prediction_horizon_minutes).toBe(15);
    expect(result.models.length).toBe(3);

    const ids = result.models.map((m) => m.id);
    expect(ids).toContain('damped_exponential');
    expect(ids).toContain('xgboost_regressor');
    expect(ids).toContain('holt_winters');

    for (const model of result.models) {
      expect(model.metrics.r2).toBeGreaterThanOrEqual(0);
      expect(model.metrics.r2).toBeLessThanOrEqual(1.0);
      expect(model.metrics.rmse).toBeGreaterThan(0);
      expect(model.metrics.mae).toBeGreaterThan(0);
      expect(model.metrics.mape).toBeGreaterThan(0);
      expect(model.inference_latency_ms).toBeGreaterThanOrEqual(0);
    }

    expect(result.comparison_summary).toHaveProperty('best_overall_model');
    expect(result.comparison_summary).toHaveProperty('production_recommendation');
  });

  it('AnalyticsService: exportDataLakeLayer exporta capas en JSON y CSV', () => {
    const analyticsService = app.get(AnalyticsService);

    // Bronze
    const bronzeJson = analyticsService.exportDataLakeLayer('bronze', 'json');
    expect(bronzeJson.layer).toBe('bronze');
    expect(bronzeJson.format).toBe('json');
    expect(Array.isArray(bronzeJson.data)).toBe(true);

    const bronzeCsv = analyticsService.exportDataLakeLayer('bronze', 'csv');
    expect(bronzeCsv.layer).toBe('bronze');
    expect(bronzeCsv.format).toBe('csv');
    expect(typeof bronzeCsv.data).toBe('string');
    if (bronzeCsv.record_count > 0) {
      expect(bronzeCsv.data).toContain('id');
      expect(bronzeCsv.data).toContain('ppm');
    }

    // Silver
    const silverCsv = analyticsService.exportDataLakeLayer('silver', 'csv');
    expect(silverCsv.layer).toBe('silver');
    expect(typeof silverCsv.data).toBe('string');

    // Gold
    const goldCsv = analyticsService.exportDataLakeLayer('gold', 'csv');
    expect(goldCsv.layer).toBe('gold');
    expect(typeof goldCsv.data).toBe('string');
  });

  it('GET /api/analytics/correlation-matrix responde 200 con formato canónico', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/correlation-matrix`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;

    expect(json.success).toBe(true);
    expect(json.error).toBe(null);
    expect(json.data).toHaveProperty('variables');
    expect(json.data).toHaveProperty('matrix');
    expect(json.data).toHaveProperty('pairs');
    expect(json.data).toHaveProperty('insights');
    expect(json.data.variables.length).toBe(5);
  });

  it('GET /api/analytics/model-metrics responde 200 con formato canónico', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/model-metrics`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;

    expect(json.success).toBe(true);
    expect(json.error).toBe(null);
    expect(json.data).toHaveProperty('models');
    expect(json.data).toHaveProperty('comparison_summary');
    expect(json.data.models.length).toBe(3);
  });

  it('GET /api/analytics/export/silver?format=json responde 200 con JSON', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/export/silver?format=json`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;

    expect(json.success).toBe(true);
    expect(json.error).toBe(null);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('GET /api/analytics/export/silver?format=csv responde con headers CSV y descarga attachment', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/export/silver?format=csv`);
    expect(res.status).toBe(200);

    const contentType = res.headers.get('content-type');
    const contentDisposition = res.headers.get('content-disposition');

    expect(contentType).toContain('text/csv');
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('air_guardian_silver_');
    expect(contentDisposition).toContain('.csv');

    const csvBody = await res.text();
    expect(typeof csvBody).toBe('string');
  });

  it('GET /api/analytics/export/bronze?format=csv descarga CSV de capa Bronze', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/export/bronze?format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(typeof text).toBe('string');
  });

  it('GET /api/analytics/export/gold?format=csv descarga CSV de capa Gold', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/export/gold?format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
  });

  it('GET /api/analytics/export/invalid_layer responde 400 y formato estándar de error', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/export/unsupported_layer`);
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;

    expect(json.success).toBe(false);
    expect(json.data).toBe(null);
    expect(json.error).toBeDefined();
  });

  it('GET /api/analytics/export/silver?format=xml responde 400 y formato estándar de error', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/export/silver?format=xml`);
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;

    expect(json.success).toBe(false);
    expect(json.data).toBe(null);
    expect(json.error).toBeDefined();
  });
});
