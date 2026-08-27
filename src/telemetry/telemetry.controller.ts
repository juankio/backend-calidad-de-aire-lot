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
  QueryHistorySchema,
  type TelemetryIngestDto,
  type QueryHistoryDto,
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
    const result = this.telemetryService.processAndBroadcast(data);
    return {
      data: result,
      message: 'Telemetría ingestada y procesada correctamente',
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
