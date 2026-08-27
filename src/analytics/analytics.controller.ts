import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import {
  DataLakeLayerSchema,
  ExportFormatSchema,
  type DataLakeLayer,
  type ExportFormat,
} from './dto/analytics.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /api/analytics/model-metrics
   * Comparativa rigurosa y métricas de evaluación (R², RMSE, MAE, MAPE) de modelos predictivos.
   */
  @Get('model-metrics')
  getModelMetrics() {
    const metrics = this.analyticsService.calculateModelEvaluationMetrics();
    return {
      data: metrics,
      message:
        'Métricas de evaluación y comparativa de modelos calculadas con éxito',
    };
  }

  /**
   * GET /api/analytics/correlation-matrix
   * Matriz de correlación de Pearson para variables críticas ambientales.
   */
  @Get('correlation-matrix')
  getCorrelationMatrix() {
    const matrix = this.analyticsService.calculateCorrelationMatrix();
    return {
      data: matrix,
      message: 'Matriz de correlación de Pearson calculada con éxito',
    };
  }

  /**
   * GET /api/analytics/export/:layer
   * Exporta la capa Medallion (bronze, silver, gold) en formato CSV o JSON.
   * Query params: ?format=csv|json&limit=1000
   */
  @Get('export/:layer')
  exportDataLakeLayer(
    @Param('layer') rawLayer: string,
    @Query('format') rawFormat: string = 'json',
    @Query('limit') rawLimit: string | undefined,
    @Res() res: Response,
  ) {
    // 1. Validar capa con Zod
    const layerParse = DataLakeLayerSchema.safeParse(rawLayer?.toLowerCase());
    if (!layerParse.success) {
      throw new BadRequestException({
        message: 'Capa no válida. Debe ser bronze, silver o gold.',
        errors: layerParse.error.format(),
      });
    }

    // 2. Validar formato con Zod
    const formatParse = ExportFormatSchema.safeParse(
      (rawFormat || 'json').toLowerCase(),
    );
    if (!formatParse.success) {
      throw new BadRequestException({
        message: 'Formato no válido. Debe ser json o csv.',
        errors: formatParse.error.format(),
      });
    }

    const layer: DataLakeLayer = layerParse.data;
    const format: ExportFormat = formatParse.data;
    const limit = rawLimit ? parseInt(rawLimit, 10) : undefined;

    const result = this.analyticsService.exportDataLakeLayer(
      layer,
      format,
      limit,
    );

    // 3. Si el formato solicitado es CSV, emitir headers de descarga y stream directo
    if (format === 'csv') {
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `air_guardian_${layer}_${dateStr}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      return res.status(HttpStatus.OK).send(result.data);
    }

    // 4. Formato JSON canónico estándar
    return res.status(HttpStatus.OK).json({
      success: true,
      data: result.data,
      message: `Capa ${layer} exportada con éxito (${result.record_count} registros)`,
      error: null,
    });
  }
}
