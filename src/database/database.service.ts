import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Database } from 'bun:sqlite';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db!: Database;

  onModuleInit() {
    this.initDatabase();
  }

  private initDatabase() {
    this.logger.log('🔥 Inicializando Data Lake SQLite con arquitectura Medallion...');
    this.db = new Database('air_guardian_datalake.sqlite');

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
