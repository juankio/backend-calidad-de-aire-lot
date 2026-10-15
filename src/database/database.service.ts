import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db!: Database;

  onModuleInit() {
    this.initDatabase();
    this.seedDefaultLocationsAndData(false);
  }

  private initDatabase() {
    const dbPath = process.env.DATABASE_PATH || 'air_guardian_datalake.sqlite';
    const dbDir = path.dirname(dbPath);
    if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.logger.log(`🔥 Inicializando Data Lake SQLite en "${dbPath}" con arquitectura Medallion...`);
    this.db = new Database(dbPath);

    // 1. Activar WAL (Write-Ahead Logging) para máxima concurrencia y velocidad
    this.db.run('PRAGMA journal_mode = WAL;');
    this.db.run('PRAGMA synchronous = NORMAL;');
    this.db.run('PRAGMA foreign_keys = ON;');

    // 2. CAPA BRONZE (Data Lake): Ingesta cruda inmutable
    this.db.run(`
      CREATE TABLE IF NOT EXISTS bronze_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        ppm REAL NOT NULL,
        co_ppm REAL NOT NULL,
        temperature REAL NOT NULL,
        humidity REAL NOT NULL,
        delta_ppm REAL NOT NULL,
        raw_adc INTEGER NOT NULL,
        ingested_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 3. CATÁLOGO DE SESIONES / CAMPAÑAS GEO-REFERENCIADAS
    this.db.run(`
      CREATE TABLE IF NOT EXISTS measurement_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius_meters REAL DEFAULT 50,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        device_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 4. CAPA SILVER (Data Warehouse): Telemetría curada y enriquecida con predicción y sesión
    this.db.run(`
      CREATE TABLE IF NOT EXISTS silver_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        session_id TEXT,
        timestamp INTEGER NOT NULL,
        ppm REAL NOT NULL,
        co_ppm REAL NOT NULL,
        temperature REAL NOT NULL,
        humidity REAL NOT NULL,
        delta_ppm_1m REAL NOT NULL,
        predicted_ppm_15m REAL NOT NULL,
        risk_status TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES measurement_sessions(id)
      );
    `);

    // 5. CAPA GOLD (Data Mart / Analytical Views): Agregaciones y KPIs listos para BI
    this.db.run(`
      CREATE VIEW IF NOT EXISTS gold_session_metrics AS
      SELECT 
        s.id AS session_id,
        s.name,
        s.description,
        s.latitude,
        s.longitude,
        s.radius_meters,
        s.start_time,
        s.end_time,
        s.device_id,
        COUNT(t.id) AS total_samples,
        COALESCE(AVG(t.ppm), 0) AS avg_ppm,
        COALESCE(MAX(t.ppm), 0) AS max_ppm,
        COALESCE(MIN(t.ppm), 0) AS min_ppm,
        COALESCE(AVG(t.co_ppm), 0) AS avg_co_ppm,
        COALESCE(AVG(t.temperature), 0) AS avg_temp,
        COALESCE(AVG(t.humidity), 0) AS avg_humidity
      FROM measurement_sessions s
      LEFT JOIN silver_telemetry t ON s.id = t.session_id
      GROUP BY s.id;
    `);

    // 6. Índices para consultas analíticas ultra-rápidas
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_bronze_time ON bronze_telemetry(timestamp);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_bronze_device_time ON bronze_telemetry(device_id, timestamp DESC);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_silver_time ON silver_telemetry(timestamp);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_silver_device_time ON silver_telemetry(device_id, timestamp DESC);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_silver_session_time ON silver_telemetry(session_id, timestamp DESC);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_device_time ON measurement_sessions(device_id, start_time DESC);`);

    this.logger.log('✅ Arquitectura Data Lake (Bronze/Silver/Gold) y WAL inicializados con éxito.');
  }

  getDb(): Database {
    if (!this.db) {
      this.initDatabase();
    }
    return this.db;
  }

  query<T = any>(sql: string) {
    return this.getDb().query<T, any>(sql);
  }

  run(sql: string, params?: any[]) {
    if (params && params.length > 0) {
      return this.getDb().run(sql, params);
    }
    return this.getDb().run(sql);
  }

  /**
   * Siembra ubicaciones estratégicas por defecto y muestras analíticas realistas
   * para el funcionamiento inmediato del mapa táctico y analítica en modo local.
   */
  seedDefaultLocationsAndData(force = false): { seeded: boolean; sessionsCount: number; samplesCount: number } {
    const existing = this.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM measurement_sessions WHERE id IN ('session-universidad-01', 'session-parque-01', 'session-laboratorio-01', 'session-hogar-01')",
    ).get();
    const defaultsCount = existing?.count ?? 0;

    if (defaultsCount >= 4 && !force) {
      this.logger.log(`ℹ️ Data Lake ya cuenta con las ubicaciones por defecto.`);
      return { seeded: false, sessionsCount: defaultsCount, samplesCount: 0 };
    }

    this.logger.log('🌱 Sembrando ubicaciones y telemetría por defecto en Data Lake...');

    const defaultSessions = [
      {
        id: 'session-universidad-01',
        name: 'Universidad - Campus Central',
        description: 'Aulas de ingeniería, laboratorios y zona de cafetería',
        latitude: 4.145,
        longitude: -73.628,
        radius_meters: 120,
        start_time: Date.now() - 3600000 * 5,
        end_time: Date.now() - 3600000 * 4,
        device_id: 'air-guardian-01',
        base_ppm: 480,
        base_co: 2.1,
        temp: 24.5,
        hum: 54,
        scenario: 'moderate',
      },
      {
        id: 'session-parque-01',
        name: 'Parque Central Los Libertadores',
        description: 'Área verde abierta arbolada con alta dispersión eólica',
        latitude: 4.15,
        longitude: -73.633,
        radius_meters: 150,
        start_time: Date.now() - 3600000 * 4,
        end_time: Date.now() - 3600000 * 3,
        device_id: 'air-guardian-01',
        base_ppm: 410,
        base_co: 0.9,
        temp: 22.8,
        hum: 60,
        scenario: 'optimal',
      },
      {
        id: 'session-laboratorio-01',
        name: 'Laboratorio de Prototipado IoT',
        description: 'Banco de pruebas de gas MQ-135 y experimentos de combustión controlada',
        latitude: 4.142,
        longitude: -73.6266,
        radius_meters: 60,
        start_time: Date.now() - 3600000 * 3,
        end_time: Date.now() - 3600000 * 2,
        device_id: 'air-guardian-01',
        base_ppm: 650,
        base_co: 8.5,
        temp: 26.2,
        hum: 48,
        scenario: 'critical_stress',
      },
      {
        id: 'session-hogar-01',
        name: 'Hogar - Base Operativa',
        description: 'Recinto residencial interior y monitoreo nocturno de confort',
        latitude: 4.138,
        longitude: -73.622,
        radius_meters: 80,
        start_time: Date.now() - 3600000 * 2,
        end_time: null, // Sesión activa actual
        device_id: 'air-guardian-01',
        base_ppm: 430,
        base_co: 1.4,
        temp: 23.5,
        hum: 52,
        scenario: 'home_clean',
      },
    ];

    let totalSamplesInserted = 0;
    const db = this.getDb();

    const insertSession = db.prepare(`
      INSERT OR REPLACE INTO measurement_sessions (id, name, description, latitude, longitude, radius_meters, start_time, end_time, device_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBronze = db.prepare(`
      INSERT INTO bronze_telemetry (device_id, timestamp, ppm, co_ppm, temperature, humidity, delta_ppm, raw_adc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSilver = db.prepare(`
      INSERT INTO silver_telemetry (device_id, session_id, timestamp, ppm, co_ppm, temperature, humidity, delta_ppm_1m, predicted_ppm_15m, risk_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedTx = db.transaction(() => {
      for (const s of defaultSessions) {
        insertSession.run(
          s.id,
          s.name,
          s.description,
          s.latitude,
          s.longitude,
          s.radius_meters,
          s.start_time,
          s.end_time,
          s.device_id,
        );

        // Generar 20 muestras realistas por sesión
        const sampleCount = 20;
        const duration = s.end_time ? s.end_time - s.start_time : 3600000;
        const stepMs = Math.floor(duration / sampleCount);

        let currentPpm = s.base_ppm;
        let prevPpm = currentPpm;

        for (let i = 0; i < sampleCount; i++) {
          const sampleTs = s.start_time + i * stepMs;

          if (s.scenario === 'optimal') {
            currentPpm = s.base_ppm + Math.sin(i / 3) * 15 + (Math.random() * 6 - 3);
          } else if (s.scenario === 'moderate') {
            currentPpm = s.base_ppm + (i / sampleCount) * 120 + Math.sin(i / 2) * 20;
          } else if (s.scenario === 'critical_stress') {
            if (i < 5) currentPpm = s.base_ppm + i * 40;
            else if (i < 12) currentPpm = 900 + (i - 5) * 110;
            else if (i < 16) currentPpm = 1650 - (i - 12) * 200;
            else currentPpm = 650 - (i - 16) * 30;
          } else {
            currentPpm = s.base_ppm + Math.sin(i / 4) * 25 + (Math.random() * 8 - 4);
          }

          const roundedPpm = Math.round(currentPpm * 10) / 10;
          const delta1m = Math.round(((roundedPpm - prevPpm) / (stepMs / 60000)) * 10) / 10;
          prevPpm = roundedPpm;

          const coPpm = Math.round((roundedPpm / (s.scenario === 'critical_stress' ? 45.0 : 160.0)) * 10) / 10;
          const temp = Math.round((s.temp + (Math.random() * 0.4 - 0.2)) * 10) / 10;
          const hum = Math.round((s.hum + (Math.random() * 1.5 - 0.75)) * 10) / 10;
          const rawAdc = Math.min(4095, Math.round(roundedPpm * 1.5));

          const rawPred = Math.round(roundedPpm + delta1m * 15 * 0.65);
          const predicted15m = Math.max(380, Math.min(10000, rawPred));

          let riskStatus: 'OPTIMAL' | 'WARNING_PREDICTIVE' | 'CRITICAL' | 'RECOVERY' = 'OPTIMAL';
          if (coPpm > 25 || roundedPpm > 1400 || predicted15m > 1600) {
            riskStatus = 'CRITICAL';
          } else if (delta1m > 35 || predicted15m > 850 || roundedPpm > 800) {
            riskStatus = 'WARNING_PREDICTIVE';
          } else if (delta1m < -30 && roundedPpm < 700) {
            riskStatus = 'RECOVERY';
          }

          insertBronze.run(s.device_id, sampleTs, roundedPpm, coPpm, temp, hum, delta1m, rawAdc);
          insertSilver.run(s.device_id, s.id, sampleTs, roundedPpm, coPpm, temp, hum, delta1m, predicted15m, riskStatus);
          totalSamplesInserted++;
        }
      }
    });

    seedTx();
    this.logger.log(`✅ Se sembraron ${defaultSessions.length} ubicaciones por defecto con ${totalSamplesInserted} muestras en Bronze/Silver.`);
    return { seeded: true, sessionsCount: defaultSessions.length, samplesCount: totalSamplesInserted };
  }

  onModuleDestroy() {
    if (this.db) {
      try {
        this.db.close();
        this.logger.log('🛑 Conexión SQLite cerrada con éxito.');
      } catch (err) {
        this.logger.error('Error al cerrar base de datos SQLite', err);
      }
    }
  }
}
