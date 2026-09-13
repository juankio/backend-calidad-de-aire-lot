import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  TelemetryIngestSchema,
  TelemetryBatchSchema,
  QueryHistorySchema,
  TelemetryCommandSchema,
  type TelemetryIngestDto,
  type TelemetryBatchDto,
  type QueryHistoryDto,
  type TelemetryCommandDto,
} from './dto/telemetry.dto';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('ingest')
  @HttpCode(HttpStatus.CREATED)
  ingestTelemetry(
    @Body(new ZodValidationPipe(TelemetryIngestSchema))
    data: TelemetryIngestDto,
  ) {
    const enriched = this.telemetryService.processAndBroadcast(data, 'hardware');
    const pending = this.telemetryService.consumeCommand(data.device_id);

    return {
      success: true,
      data: enriched,
      command_view_mode: pending?.view_mode,
      command_emotion: pending?.emotion,
      message: 'Telemetría ingestada y procesada correctamente',
    };
  }

  @Post('command')
  @HttpCode(HttpStatus.OK)
  sendCommand(
    @Body(new ZodValidationPipe(TelemetryCommandSchema))
    body: TelemetryCommandDto,
  ) {
    const deviceId = body.device_id || 'air-guardian-01';
    const cmd = {
      view_mode: body.view_mode as 'FACE' | 'HUD' | undefined,
      emotion: body.emotion,
    };

    // 1. Encolar para recogida por el ESP32 en el siguiente ciclo HTTP
    this.telemetryService.queueCommand(deviceId, cmd);

    // 2. Difundir inmediatamente por WebSocket para reactividad instantánea en frontend
    this.telemetryService.broadcastCommand(deviceId, cmd);

    return {
      success: true,
      data: {
        device_id: deviceId,
        ...cmd,
      },
      message: 'Comando registrado y difundido con éxito',
    };
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  ingestTelemetryBatch(
    @Body(new ZodValidationPipe(TelemetryBatchSchema))
    samples: TelemetryBatchDto,
  ) {
    const result = this.telemetryService.processTelemetryBatch(samples, 'hardware');
    return {
      data: result,
      message: `Lote de telemetría (${result.total_processed} muestras) procesado y persistido correctamente`,
    };
  }

  @Get('live')
  getLiveTelemetry() {
    const latest = this.telemetryService.getLiveTelemetry();
    return {
      data: latest,
      message: latest
        ? 'Última lectura obtenida'
        : 'No hay telemetría registrada aún',
    };
  }

  @Get('history')
  getHistory(
    @Query(new ZodValidationPipe(QueryHistorySchema))
    query: QueryHistoryDto,
  ) {
    const history = this.telemetryService.getHistory(query);
    return {
      data: history,
      message: 'Histórico de telemetría recuperado',
    };
  }
}
