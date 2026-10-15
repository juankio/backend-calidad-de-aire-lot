import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DatabaseService } from './database/database.service';
import { TelemetryService } from './telemetry/telemetry.service';
import { SimulatorService } from './simulator/simulator.service';
import { getDashboardHtml } from './views/dashboard.view';

@Controller()
export class AppController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly telemetryService: TelemetryService,
    private readonly simulatorService: SimulatorService,
  ) {}

  @Get()
  root(@Req() req: Request, @Res() res: Response) {
    // Si la petición viene de cURL o pide JSON explícitamente sin aceptar HTML
    if (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html')) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.json({
        success: true,
        service: 'Air Guardian IoT Sentinel S3 API',
        status: 'ONLINE',
        architecture: 'NestJS v11 + Bun SQLite MVC',
        frontend: frontendUrl,
        endpoints: {
          telemetry: '/api/telemetry/live',
          history: '/api/telemetry/history',
          sessions: '/api/sessions',
          heatmap: '/api/heatmap',
          analytics: '/api/analytics/model-metrics',
          websocket: 'ws://localhost:3002/',
        },
        message: 'Air Guardian Sentinel API operativa.',
        error: null,
      });
    }

    // Por defecto para cualquier navegador web (Vista MVC del Backend)
    let bronzeCount = 0;
    let silverCount = 0;
    let sessionsCount = 0;

    try {
      const bRow = this.databaseService.query('SELECT COUNT(*) as count FROM bronze_telemetry').get() as { count: number } | null;
      bronzeCount = bRow ? bRow.count : 0;

      const sRow = this.databaseService.query('SELECT COUNT(*) as count FROM silver_telemetry').get() as { count: number } | null;
      silverCount = sRow ? sRow.count : 0;

      const sesRow = this.databaseService.query('SELECT COUNT(*) as count FROM measurement_sessions').get() as { count: number } | null;
      sessionsCount = sesRow ? sesRow.count : 0;
    } catch {}

    const liveTelemetry = this.telemetryService.getLiveTelemetry();
    const simulator = this.simulatorService.getDetailedStatus();
    const port = process.env.PORT || 3002;

    const html = getDashboardHtml({
      bronzeCount,
      silverCount,
      sessionsCount,
      port,
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
      nodeVersion: process.version,
      bunVersion: (process as any).versions?.bun || '1.3.7',
      liveTelemetry,
      simulator,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  @Get('health')
  health() {
    return {
      status: 'UP',
      service: 'Air Guardian IoT Backend',
      timestamp: new Date().toISOString(),
    };
  }
}
