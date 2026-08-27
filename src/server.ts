import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { initializeDatabase, db } from "./database";
import {
  TelemetryIngestSchema,
  CreateSessionSchema,
  QueryHistorySchema
} from "./schemas";
import { PredictiveEngine } from "./predictive_engine";

// 1. Inicializar Base de Datos (Data Lake & Warehouse)
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Helper de Respuesta Estándar
function formatResponse(success: boolean, data: any = null, message: string = "", error: any = null) {
  return { success, data, message, error };
}

// --------------------------------------------------------------------------
// WEBSOCKET SERVER (Telemetría en tiempo real hacia Frontend / Nuxt)
// --------------------------------------------------------------------------
interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
}

const wsClients = new Set<ExtendedWebSocket>();

function broadcastTelemetry(payload: any) {
  const msg = JSON.stringify(payload);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
      } catch (err) {
        wsClients.delete(client);
        try { client.terminate(); } catch (_) {}
      }
    } else if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
      wsClients.delete(client);
    }
  }
}

// --------------------------------------------------------------------------
// RUTAS DE LA API (Express REST)
// --------------------------------------------------------------------------

// 1. Ingesta de Telemetría IoT (ESP32 o Simulador)
app.post("/api/telemetry/ingest", (req: Request, res: Response) => {
  try {
    const parseResult = TelemetryIngestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatResponse(false, null, "Datos de telemetría inválidos", parseResult.error.format()));
    }

    const data = parseResult.data;
    const prediction = PredictiveEngine.processTelemetry(data);

    const broadcastData = {
      ...data,
      predicted_ppm_15m: prediction.predicted_ppm_15m,
      delta_ppm_1m: prediction.delta_ppm_1m,
      risk_status: prediction.risk_status,
      session_id: prediction.session_id,
      timestamp_iso: new Date(data.timestamp).toISOString()
    };

    broadcastTelemetry({ type: "TELEMETRY_UPDATE", payload: broadcastData });

    return res.status(201).json(formatResponse(true, broadcastData, "Telemetría ingestada y procesada correctamente"));
  } catch (error: any) {
    console.error("[CSO Audit Exception] Error en ingesta:", error);
    return res.status(500).json(formatResponse(false, null, "Fallo interno al procesar telemetría", error?.message || "Internal error"));
  }
});

// 2. Última lectura en vivo (Live Telemetry & Prediction)
app.get("/api/telemetry/live", (req: Request, res: Response) => {
  try {
    const latest = db.query(
      `SELECT * FROM silver_telemetry ORDER BY timestamp DESC LIMIT 1`
    ).get() as any;

    if (!latest) {
      return res.json(formatResponse(true, null, "No hay telemetría registrada aún"));
    }

    return res.json(formatResponse(true, latest, "Última lectura obtenida"));
  } catch (error: any) {
    return res.status(500).json(formatResponse(false, null, "Error al obtener telemetría en vivo", error?.message || "Internal error"));
  }
});

// 3. Consulta de Históricos (Series Temporales)
app.get("/api/telemetry/history", (req: Request, res: Response) => {
  try {
    const parseResult = QueryHistorySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json(formatResponse(false, null, "Parámetros de consulta inválidos", parseResult.error.format()));
    }

    const { device_id, session_id, start_time, end_time, limit } = parseResult.data;
    let query = `SELECT * FROM silver_telemetry WHERE 1=1`;
    const params: any[] = [];

    if (device_id) {
      query += ` AND device_id = ?`;
      params.push(device_id);
    }
    if (session_id) {
      query += ` AND session_id = ?`;
      params.push(session_id);
    }
    if (start_time !== undefined) {
      query += ` AND timestamp >= ?`;
      params.push(start_time);
    }
    if (end_time !== undefined) {
      query += ` AND timestamp <= ?`;
      params.push(end_time);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const rows = db.query(query).all(...params);
    return res.json(formatResponse(true, rows.reverse(), "Histórico de telemetría recuperado"));
  } catch (error: any) {
    return res.status(500).json(formatResponse(false, null, "Error al recuperar histórico", error?.message || "Internal error"));
  }
});

// 4. Catálogo de Sesiones / Campañas de Medición Geo-Referenciadas
app.post("/api/sessions", (req: Request, res: Response) => {
  try {
    const parseResult = CreateSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(formatResponse(false, null, "Parámetros de sesión inválidos", parseResult.error.format()));
    }

    const data = parseResult.data;
    const id = crypto.randomUUID();

    db.run(
      `INSERT INTO measurement_sessions (id, name, description, latitude, longitude, radius_meters, start_time, end_time, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.description || "",
        data.latitude,
        data.longitude,
        data.radius_meters,
        data.start_time,
        data.end_time || null,
        data.device_id
      ]
    );

    const created = db.query(`SELECT * FROM measurement_sessions WHERE id = ?`).get(id);
    return res.status(201).json(formatResponse(true, created, "Campaña de medición creada exitosamente"));
  } catch (error: any) {
    return res.status(500).json(formatResponse(false, null, "Error al crear campaña de medición", error?.message || "Internal error"));
  }
});

// 5. Listar Sesiones con Estadísticas de Calidad de Aire (Gold Layer View)
app.get("/api/sessions", (_req: Request, res: Response) => {
  try {
    const sessions = db.query(`SELECT * FROM gold_session_metrics ORDER BY start_time DESC`).all();
    return res.json(formatResponse(true, sessions, "Listado de campañas obtenido"));
  } catch (error: any) {
    return res.status(500).json(formatResponse(false, null, "Error al listar campañas", error?.message || "Internal error"));
  }
});

// 6. Mapa de Calor / Heatmap Geoespacial (Gold Layer View)
app.get("/api/heatmap", (_req: Request, res: Response) => {
  try {
    const points = db.query(
      `SELECT session_id, name, latitude, longitude, radius_meters, avg_ppm, max_ppm, total_samples as sample_count
       FROM gold_session_metrics
       WHERE total_samples > 0`
    ).all();

    return res.json(formatResponse(true, points, "Puntos geoespaciales recuperados"));
  } catch (error: any) {
    return res.status(500).json(formatResponse(false, null, "Error al generar mapa de calor", error?.message || "Internal error"));
  }
});

// 7. Inyección de datos simulados (para probar el sistema de inmediato)
let simulationInterval: any = null;
let simPpm = 410;
let simTrend = 1;

app.post("/api/simulate/toggle", (req: Request, res: Response) => {
  try {
    const enable = req.body.enable ?? true;

    if (enable && !simulationInterval) {
      simulationInterval = setInterval(() => {
        // Simular fluctuación ambiental con picos
        if (simPpm > 1300) simTrend = -1;
        if (simPpm < 420) simTrend = 1;
        simPpm += simTrend * (10 + Math.random() * 25);

        const sample = {
          device_id: "air-guardian-01",
          timestamp: Date.now(),
          ppm: Math.round(simPpm * 10) / 10,
          co_ppm: Math.round((simPpm / 70.0) * 10) / 10,
          temperature: 24.2 + (Math.random() * 0.4 - 0.2),
          humidity: 56 + (Math.random() * 2 - 1),
          delta_ppm: simTrend * 15,
          raw_adc: Math.round(simPpm * 1.5)
        };

        const prediction = PredictiveEngine.processTelemetry(sample);
        broadcastTelemetry({
          type: "TELEMETRY_UPDATE",
          payload: {
            ...sample,
            predicted_ppm_15m: prediction.predicted_ppm_15m,
            delta_ppm_1m: prediction.delta_ppm_1m,
            risk_status: prediction.risk_status,
            session_id: prediction.session_id,
            timestamp_iso: new Date(sample.timestamp).toISOString()
          }
        });
      }, 2000);

      return res.json(formatResponse(true, { running: true }, "Simulador ambiental en tiempo real ACTIVADO"));
    } else if (!enable && simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
      return res.json(formatResponse(true, { running: false }, "Simulador ambiental DESACTIVADO"));
    }

    return res.json(formatResponse(true, { running: !!simulationInterval }, "Estado del simulador"));
  } catch (error: any) {
    return res.status(500).json(formatResponse(false, null, "Error en simulador", error?.message || "Internal error"));
  }
});

// Iniciar Servidor HTTP & WebSocket
const server = app.listen(PORT, () => {
  console.log(`🚀 [BACKEND] Servidor Air Guardian corriendo en http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: ExtendedWebSocket) => {
  ws.isAlive = true;
  wsClients.add(ws);
  
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("error", (err) => {
    console.error("[WebSocket Client Error]", err);
    wsClients.delete(ws);
  });

  ws.on("close", () => {
    wsClients.delete(ws);
  });

  try {
    ws.send(JSON.stringify({ type: "CONNECTION_ACK", message: "Conectado al stream de telemetría IoT" }));
  } catch (err) {
    wsClients.delete(ws);
  }
});

// Heartbeat cada 30s para podar sockets zombis y evitar fugas de memoria
const heartbeatInterval = setInterval(() => {
  for (const ws of wsClients) {
    if (ws.isAlive === false) {
      wsClients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// Limpieza de recursos al apagar el servidor
function gracefulShutdown() {
  console.log("🛑 Cerrando servidor y liberando recursos...");
  if (simulationInterval) clearInterval(simulationInterval);
  clearInterval(heartbeatInterval);
  wss.close();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
