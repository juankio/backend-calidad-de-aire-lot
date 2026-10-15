import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryGateway } from './telemetry.gateway';
import { TelemetryController } from './telemetry.controller';
import { TelemetryRepository } from './telemetry.repository';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryGateway, TelemetryRepository],
  exports: [TelemetryService, TelemetryGateway, TelemetryRepository],
})
export class TelemetryModule {}
