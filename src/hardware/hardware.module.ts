import { Module } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { SerialLinkService } from './serial-link.service';
import { HardwareController } from './hardware.controller';

@Module({
  imports: [TelemetryModule],
  controllers: [HardwareController],
  providers: [SerialLinkService],
  exports: [SerialLinkService],
})
export class HardwareModule {}
