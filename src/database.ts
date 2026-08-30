import { Database } from 'bun:sqlite';

const db = new Database('air_guardian_datalake.sqlite');

db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA synchronous = NORMAL;');
db.run('PRAGMA foreign_keys = ON;');

export function initializeDatabase() {
  db.run(`
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

  db.run(`
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

  db.run(`
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

  db.run(`
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

  db.run(`CREATE INDEX IF NOT EXISTS idx_bronze_time ON bronze_telemetry(timestamp);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bronze_device_time ON bronze_telemetry(device_id, timestamp DESC);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_silver_time ON silver_telemetry(timestamp);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_silver_device_time ON silver_telemetry(device_id, timestamp DESC);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_silver_session_time ON silver_telemetry(session_id, timestamp DESC);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_device_time ON measurement_sessions(device_id, start_time DESC);`);
}

export { db };
