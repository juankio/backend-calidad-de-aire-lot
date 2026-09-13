import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import type { INestApplication } from '@nestjs/common';
import { WebSocket } from 'ws';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {
  TelemetryIngestSchema,
  SingleBatchSampleSchema,
  TelemetryBatchSchema,
  CreateSessionSchema,
} from './schemas';
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

  it('acepta campos opcionales de hardware y diagnóstico en TelemetryIngestSchema y SingleBatchSampleSchema', () => {
    const extendedPayload = {
      device_id: 'air-guardian-01',
      timestamp: Date.now(),
      ppm: 420,
      co_ppm: 2.5,
      temperature: 24.0,
      humidity: 55.0,
      delta_ppm: 0,
      raw_adc: 630,
      raw_adc7: 512,
      mpu_connected: true,
      eye_x: 12,
      eye_y: -4,
      free_heap: 184320,
      uptime_s: 3600,
      offline_pending: 0,
    };

    const resIngest = TelemetryIngestSchema.safeParse(extendedPayload);
    expect(resIngest.success).toBe(true);
    if (resIngest.success) {
      expect(resIngest.data.raw_adc7).toBe(512);
      expect(resIngest.data.mpu_connected).toBe(true);
      expect(resIngest.data.eye_x).toBe(12);
      expect(resIngest.data.eye_y).toBe(-4);
      expect(resIngest.data.free_heap).toBe(184320);
      expect(resIngest.data.uptime_s).toBe(3600);
      expect(resIngest.data.offline_pending).toBe(0);
    }

    const resBatchSample = SingleBatchSampleSchema.safeParse(extendedPayload);
    expect(resBatchSample.success).toBe(true);
    if (resBatchSample.success) {
      expect(resBatchSample.data.raw_adc7).toBe(512);
      expect(resBatchSample.data.mpu_connected).toBe(true);
      expect(resBatchSample.data.eye_x).toBe(12);
      expect(resBatchSample.data.eye_y).toBe(-4);
      expect(resBatchSample.data.free_heap).toBe(184320);
      expect(resBatchSample.data.uptime_s).toBe(3600);
      expect(resBatchSample.data.offline_pending).toBe(0);
    }
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

  it('valida lotes batch de telemetría como array y como objeto con samples', () => {
    const rawSamples = [
      {
        device_id: 'air-guardian-01',
        timestamp: 1700000000000,
        ppm: 430,
        co_ppm: 1.2,
        temperature: 24,
        humidity: 50,
        delta_ppm: 0,
        raw_adc: 645,
      },
      {
        device_id: 'air-guardian-01',
        timestamp: 1700000060000,
        ppm: 440,
        co_ppm: 1.3,
        temperature: 24.1,
        humidity: 50.5,
        delta_ppm: 10,
        raw_adc: 660,
      },
    ];

    // 1. Como array directo
    const resArray = TelemetryBatchSchema.safeParse(rawSamples);
    expect(resArray.success).toBe(true);
    if (resArray.success) {
      expect(resArray.data.length).toBe(2);
    }

    // 2. Como objeto con samples y device_id común
    const resObj = TelemetryBatchSchema.safeParse({
      device_id: 'esp32-offline-buffer',
      samples: [
        {
          timestamp: 1700000120000,
          ppm: 450,
          co_ppm: 1.5,
          temperature: 24.2,
          humidity: 51,
          raw_adc: 675,
        },
      ],
    });
    expect(resObj.success).toBe(true);
    if (resObj.success) {
      expect(resObj.data[0].device_id).toBe('esp32-offline-buffer');
    }

    // 3. Rechaza lote vacío
    const emptyRes = TelemetryBatchSchema.safeParse([]);
    expect(emptyRes.success).toBe(false);
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
      latitude: 4.1450,
      longitude: -73.6280,
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

    const createdId = json.data.id;

    // PATCH /api/sessions/:id
    const patchRes = await fetch(`${BASE_URL}/api/sessions/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Campaña Editada Test', radius_meters: 100 }),
    });
    expect(patchRes.status).toBe(200);
    const patchJson = (await patchRes.json()) as any;
    expect(patchJson.success).toBe(true);
    expect(patchJson.data.name).toBe('Campaña Editada Test');

    // DELETE /api/sessions/:id (Limpieza para no contaminar la base de datos)
    const deleteRes = await fetch(`${BASE_URL}/api/sessions/${createdId}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const deleteJson = (await deleteRes.json()) as any;
    expect(deleteJson.success).toBe(true);
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

  it('POST /api/simulate/toggle activa y desactiva el simulador y GET /api/simulate/status reporta estado', async () => {
    // 1. Estado inicial
    const resStatusInit = await fetch(`${BASE_URL}/api/simulate/status`);
    expect(resStatusInit.status).toBe(200);
    const jsonStatusInit = (await resStatusInit.json()) as any;
    expect(jsonStatusInit).toEqual({
      success: true,
      data: { running: false },
      message: 'Estado del simulador',
      error: null,
    });

    // 2. Activar
    const resOn = await fetch(`${BASE_URL}/api/simulate/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: true }),
    });
    expect(resOn.status).toBe(200);
    const jsonOn = (await resOn.json()) as any;
    expect(jsonOn.success).toBe(true);
    expect(jsonOn.data.running).toBe(true);

    // 3. Estado corriendo
    const resStatusRunning = await fetch(`${BASE_URL}/api/simulate/status`);
    expect(resStatusRunning.status).toBe(200);
    const jsonStatusRunning = (await resStatusRunning.json()) as any;
    expect(jsonStatusRunning).toEqual({
      success: true,
      data: { running: true },
      message: 'Estado del simulador',
      error: null,
    });

    // 4. Desactivar
    const resOff = await fetch(`${BASE_URL}/api/simulate/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: false }),
    });
    expect(resOff.status).toBe(200);
    const jsonOff = (await resOff.json()) as any;
    expect(jsonOff.success).toBe(true);
    expect(jsonOff.data.running).toBe(false);

    // 5. Estado detenido
    const resStatusFinal = await fetch(`${BASE_URL}/api/simulate/status`);
    expect(resStatusFinal.status).toBe(200);
    const jsonStatusFinal = (await resStatusFinal.json()) as any;
    expect(jsonStatusFinal).toEqual({
      success: true,
      data: { running: false },
      message: 'Estado del simulador',
      error: null,
    });
  });

  it('WebSocket recibe CONNECTION_ACK y TELEMETRY_UPDATE con source de hardware y simulator', async () => {
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

    // Ahora enviar telemetría por HTTP y verificar broadcast en WebSocket con source 'hardware'
    const updatePromise = new Promise<any>((resolve) => {
      const listener = (data: any) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'TELEMETRY_UPDATE' && parsed.payload?.device_id === 'ws-test-device') {
          ws.off('message', listener);
          resolve(parsed);
        }
      };
      ws.on('message', listener);
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

    const ingestRes = await fetch(`${BASE_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    });
    const ingestJson = (await ingestRes.json()) as any;
    expect(ingestJson.data.source).toBe('hardware');

    const updateMessage = await updatePromise;
    expect(updateMessage.type).toBe('TELEMETRY_UPDATE');
    expect(updateMessage.payload.device_id).toBe('ws-test-device');
    expect(updateMessage.payload.ppm).toBe(555);
    expect(updateMessage.payload.source).toBe('hardware');

    try { ws.terminate(); } catch (_) {}
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

  // =========================================================================
  // BATCH INGESTION (OFFLINE FLUSH) & LOCAL MODE SEEDING SUITE
  // =========================================================================

  it('POST /api/telemetry/batch procesa lote preservando timestamps originales y calculando capa Silver', async () => {
    const baseTime = Date.now() - 300000; // 5 minutos en el pasado (offline)
    const batchPayload = [
      {
        device_id: 'esp32-offline-01',
        timestamp: baseTime,
        ppm: 420,
        co_ppm: 1.5,
        temperature: 23.5,
        humidity: 50.0,
        delta_ppm: 0,
        raw_adc: 630,
      },
      {
        device_id: 'esp32-offline-01',
        timestamp: baseTime + 60000,
        ppm: 460,
        co_ppm: 2.0,
        temperature: 23.8,
        humidity: 51.0,
        delta_ppm: 0,
        raw_adc: 690,
      },
      {
        device_id: 'esp32-offline-01',
        timestamp: baseTime + 120000,
        ppm: 520,
        co_ppm: 2.8,
        temperature: 24.1,
        humidity: 52.0,
        delta_ppm: 0,
        raw_adc: 780,
      },
    ];

    const res = await fetch(`${BASE_URL}/api/telemetry/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchPayload),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.error).toBe(null);
    expect(json.data.total_received).toBe(3);
    expect(json.data.total_processed).toBe(3);
    expect(json.data.first_timestamp).toBe(baseTime);
    expect(json.data.last_timestamp).toBe(baseTime + 120000);
    expect(Array.isArray(json.data.samples)).toBe(true);
    expect(json.data.samples.length).toBe(3);

    // Verificar preservación de timestamp exacto y cálculo de capa Silver
    expect(json.data.samples[0].timestamp).toBe(baseTime);
    expect(json.data.samples[1].timestamp).toBe(baseTime + 60000);
    expect(json.data.samples[2].timestamp).toBe(baseTime + 120000);

    // Las muestras deben tener cálculo predictivo y estado de riesgo
    for (const sample of json.data.samples) {
      expect(sample).toHaveProperty('predicted_ppm_15m');
      expect(sample).toHaveProperty('risk_status');
      expect(sample).toHaveProperty('delta_ppm_1m');
      expect(sample.source).toBe('hardware');
    }

    // Comprobar que en el histórico de la base de datos se persistieron con su timestamp original
    const historyRes = await fetch(
      `${BASE_URL}/api/telemetry/history?device_id=esp32-offline-01&limit=10`,
    );
    expect(historyRes.status).toBe(200);
    const historyJson = (await historyRes.json()) as any;
    expect(historyJson.success).toBe(true);
    const found = historyJson.data.filter((h: any) => h.device_id === 'esp32-offline-01');
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/telemetry/batch con objeto contenedor { device_id, samples } procesa correctamente', async () => {
    const t0 = Date.now() - 60000;
    const containerPayload = {
      device_id: 'esp32-container-device',
      samples: [
        {
          timestamp: t0,
          ppm: 435,
          co_ppm: 1.8,
          temperature: 24.0,
          humidity: 50.0,
          raw_adc: 652,
        },
        {
          timestamp: t0 + 30000,
          ppm: 440,
          co_ppm: 1.9,
          temperature: 24.1,
          humidity: 50.2,
          raw_adc: 660,
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/api/telemetry/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerPayload),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.total_processed).toBe(2);
    expect(json.data.samples[0].device_id).toBe('esp32-container-device');
  });

  it('POST /api/telemetry/batch con datos corruptos retorna 400 y formato estándar de error', async () => {
    const invalidBatch = [
      {
        device_id: 'bad-device',
        timestamp: -999,
        ppm: 99999,
      },
    ];

    const res = await fetch(`${BASE_URL}/api/telemetry/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidBatch),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.data).toBe(null);
    expect(json.error).toBeDefined();
  });

  it('Verifica sembrado por defecto de ubicaciones ("donde estuvimos") y mapa táctico', async () => {
    // 1. Obtener sesiones
    const resSessions = await fetch(`${BASE_URL}/api/sessions`);
    expect(resSessions.status).toBe(200);
    const jsonSessions = (await resSessions.json()) as any;
    expect(jsonSessions.success).toBe(true);
    expect(Array.isArray(jsonSessions.data)).toBe(true);

    const names = jsonSessions.data.map((s: any) => s.name);
    expect(names.some((n: string) => n.includes('Universidad'))).toBe(true);
    expect(names.some((n: string) => n.includes('Parque Central'))).toBe(true);
    expect(names.some((n: string) => n.includes('Laboratorio'))).toBe(true);
    expect(names.some((n: string) => n.includes('Hogar'))).toBe(true);

    // 2. Heatmap táctico devuelve puntos con muestras
    const resHeatmap = await fetch(`${BASE_URL}/api/heatmap`);
    expect(resHeatmap.status).toBe(200);
    const jsonHeatmap = (await resHeatmap.json()) as any;
    expect(jsonHeatmap.success).toBe(true);
    expect(jsonHeatmap.data.length).toBeGreaterThanOrEqual(4);
    for (const pt of jsonHeatmap.data) {
      expect(pt.sample_count).toBeGreaterThan(0);
      expect(pt.avg_ppm).toBeGreaterThan(0);
    }
  });

  it('POST /api/simulate/seed y POST /api/simulate/phase controlan el modo local y estados emocionales', async () => {
    // 1. Re-sembrar forzadamente datos quemados
    const resSeed = await fetch(`${BASE_URL}/api/simulate/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });
    expect(resSeed.status).toBe(200);
    const jsonSeed = (await resSeed.json()) as any;
    expect(jsonSeed.success).toBe(true);
    expect(jsonSeed.data.seeded).toBe(true);

    // 2. Forzar fase CRITICAL (mascota en alerta máxima)
    const resCritPhase = await fetch(`${BASE_URL}/api/simulate/phase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'CRITICAL' }),
    });
    expect(resCritPhase.status).toBe(200);
    const jsonCritPhase = (await resCritPhase.json()) as any;
    expect(jsonCritPhase.success).toBe(true);
    expect(jsonCritPhase.data.current_phase).toBe('CRITICAL');

    // 3. Consultar estado detallado del simulador
    const resDetail = await fetch(`${BASE_URL}/api/simulate/status?detailed=true`);
    expect(resDetail.status).toBe(200);
    const jsonDetail = (await resDetail.json()) as any;
    expect(jsonDetail.success).toBe(true);
    expect(jsonDetail.data.current_phase).toBe('CRITICAL');
    expect(jsonDetail.data.manual_override).toBe('CRITICAL');

    // 4. Restaurar a ciclo automático (phase: null)
    const resAutoPhase = await fetch(`${BASE_URL}/api/simulate/phase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: null }),
    });
    expect(resAutoPhase.status).toBe(200);
    const jsonAutoPhase = (await resAutoPhase.json()) as any;
    expect(jsonAutoPhase.success).toBe(true);
    expect(jsonAutoPhase.data.manual_override).toBe(false);
  });

  it('WebSocket procesa mensaje de lote airguardian/telemetry/batch y retorna ACK', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);

    const connectedPromise = new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    await connectedPromise;

    const ackPromise = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'TELEMETRY_BATCH_ACK') {
          resolve(parsed);
        }
      });
    });

    const wsBatchMsg = {
      type: 'TELEMETRY_BATCH',
      topic: 'airguardian/telemetry/batch',
      payload: [
        {
          device_id: 'ws-esp32-batch',
          timestamp: Date.now() - 10000,
          ppm: 430,
          co_ppm: 1.2,
          temperature: 24.0,
          humidity: 50.0,
          delta_ppm: 0,
          raw_adc: 645,
        },
        {
          device_id: 'ws-esp32-batch',
          timestamp: Date.now() - 5000,
          ppm: 440,
          co_ppm: 1.3,
          temperature: 24.1,
          humidity: 50.5,
          delta_ppm: 5,
          raw_adc: 660,
        },
      ],
    };

    ws.send(JSON.stringify(wsBatchMsg));

    const ack = await ackPromise;
    expect(ack.type).toBe('TELEMETRY_BATCH_ACK');
    expect(ack.success).toBe(true);
    expect(ack.count).toBe(2);

    try { ws.terminate(); } catch (_) {}
  });

  it('GET /api/analytics/numerical-analysis calcula EDO y métodos numéricos Euler vs RK4', async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/numerical-analysis?c0=400&c_inf=1200&k=0.1&duration=20&h=1.0`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.formulation).toBeDefined();
    expect(json.data.formulation.ode_latex).toContain('dC(t)');
    expect(json.data.formulation.analytical_solution_latex).toContain('e^{-kt}');
    expect(json.data.metrics.euler).toBeDefined();
    expect(json.data.metrics.rk4).toBeDefined();
    expect(json.data.metrics.rk4.rmse).toBeLessThan(json.data.metrics.euler.rmse); // RK4 debe ser más preciso
    expect(json.data.steps.length).toBeGreaterThan(15);
    expect(json.data.latex_table_snippet).toContain('\\begin{table}');
  });

  it('POST /api/telemetry/command encola comando y POST /api/telemetry/ingest lo consume', async () => {
    const targetDevice = 'air-guardian-sync-test';

    // 1. Encolar comando vía POST /api/telemetry/command
    const cmdRes = await fetch(`${BASE_URL}/api/telemetry/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: targetDevice,
        view_mode: 'HUD',
        emotion: 'WARNING_PREDICTIVE',
      }),
    });
    expect(cmdRes.status).toBe(200);
    const cmdJson = (await cmdRes.json()) as any;
    expect(cmdJson.success).toBe(true);
    expect(cmdJson.data.view_mode).toBe('HUD');
    expect(cmdJson.data.emotion).toBe('WARNING_PREDICTIVE');

    // 2. El dispositivo hace ingest: debe recibir el comando pendiente
    const ingestRes1 = await fetch(`${BASE_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: targetDevice,
        timestamp: Date.now(),
        ppm: 430,
        co_ppm: 2.0,
        temperature: 24,
        humidity: 50,
        delta_ppm: 0,
        raw_adc: 600,
        emotion: 'OPTIMAL',
        view_mode: 'FACE',
      }),
    });
    expect(ingestRes1.status).toBe(201);
    const ingestJson1 = (await ingestRes1.json()) as any;
    expect(ingestJson1.success).toBe(true);
    expect(ingestJson1.data.view_mode).toBe('FACE');
    expect(ingestJson1.data.device_emotion).toBe('OPTIMAL');
    expect(ingestJson1.command_view_mode).toBe('HUD');
    expect(ingestJson1.command_emotion).toBe('WARNING_PREDICTIVE');

    // 3. Segundo ingest inmediato: el comando ya fue consumido y debe ser undefined
    const ingestRes2 = await fetch(`${BASE_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: targetDevice,
        timestamp: Date.now() + 1000,
        ppm: 432,
        co_ppm: 2.0,
        temperature: 24,
        humidity: 50,
        delta_ppm: 0,
        raw_adc: 600,
      }),
    });
    expect(ingestRes2.status).toBe(201);
    const ingestJson2 = (await ingestRes2.json()) as any;
    expect(ingestJson2.command_view_mode).toBeUndefined();
    expect(ingestJson2.command_emotion).toBeUndefined();
  });

  it('POST /api/telemetry/command y POST /api/telemetry/ingest emiten actualizaciones vía WebSocket', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    const receivedPayloads: any[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'TELEMETRY_UPDATE') {
        receivedPayloads.push(msg.payload);
      }
    });

    // 1. Emitir comando
    await fetch(`${BASE_URL}/api/telemetry/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: 'ws-command-device',
        view_mode: 'HUD',
        emotion: 'CRITICAL',
      }),
    });

    // Esperar unos ms para el WS
    await new Promise((r) => setTimeout(r, 100));

    expect(receivedPayloads.length).toBeGreaterThan(0);
    const lastCmd = receivedPayloads[receivedPayloads.length - 1];
    expect(lastCmd.view_mode).toBe('HUD');
    expect(lastCmd.device_emotion).toBe('CRITICAL');

    // 2. Ingest con emotion y view_mode
    await fetch(`${BASE_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: 'ws-command-device',
        timestamp: Date.now(),
        ppm: 450,
        co_ppm: 1.0,
        temperature: 23,
        humidity: 45,
        delta_ppm: 2,
        raw_adc: 610,
        emotion: 'RECOVERY',
        view_mode: 'FACE',
      }),
    });

    await new Promise((r) => setTimeout(r, 100));
    const lastIngest = receivedPayloads[receivedPayloads.length - 1];
    expect(lastIngest.view_mode).toBe('FACE');
    expect(lastIngest.device_emotion).toBe('RECOVERY');

    try { ws.terminate(); } catch (_) {}
  });

  it('processAndBroadcast propaga los campos de hardware/diagnóstico (raw_adc7, mpu_connected, eye_x, eye_y, free_heap, uptime_s, offline_pending) por WebSocket', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    const receivedPayloads: any[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'TELEMETRY_UPDATE' && msg.payload?.device_id === 'ws-hardware-diag-device') {
        receivedPayloads.push(msg.payload);
      }
    });

    const diagSample = {
      device_id: 'ws-hardware-diag-device',
      timestamp: Date.now(),
      ppm: 475,
      co_ppm: 1.8,
      temperature: 24.5,
      humidity: 50.0,
      delta_ppm: 3,
      raw_adc: 640,
      raw_adc7: 820,
      mpu_connected: true,
      eye_x: -15,
      eye_y: 20,
      free_heap: 192000,
      uptime_s: 7200,
      offline_pending: 5,
      emotion: 'OPTIMAL',
      view_mode: 'HUD',
    };

    const res = await fetch(`${BASE_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagSample),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.raw_adc7).toBe(820);
    expect(json.data.mpu_connected).toBe(true);
    expect(json.data.eye_x).toBe(-15);
    expect(json.data.eye_y).toBe(20);
    expect(json.data.free_heap).toBe(192000);
    expect(json.data.uptime_s).toBe(7200);
    expect(json.data.offline_pending).toBe(5);

    await new Promise((r) => setTimeout(r, 100));

    expect(receivedPayloads.length).toBeGreaterThan(0);
    const broadcasted = receivedPayloads[receivedPayloads.length - 1];
    expect(broadcasted.raw_adc7).toBe(820);
    expect(broadcasted.mpu_connected).toBe(true);
    expect(broadcasted.eye_x).toBe(-15);
    expect(broadcasted.eye_y).toBe(20);
    expect(broadcasted.free_heap).toBe(192000);
    expect(broadcasted.uptime_s).toBe(7200);
    expect(broadcasted.offline_pending).toBe(5);

    try { ws.terminate(); } catch (_) {}
  });
});
