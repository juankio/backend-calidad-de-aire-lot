import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { SessionsModule } from './sessions/sessions.module';
import { SimulatorModule } from './simulator/simulator.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HardwareModule } from './hardware/hardware.module';

@Module({
  imports: [
    DatabaseModule,
    TelemetryModule,
    SessionsModule,
    SimulatorModule,
    AnalyticsModule,
    HardwareModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
