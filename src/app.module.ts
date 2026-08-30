import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { SessionsModule } from './sessions/sessions.module';
import { SimulatorModule } from './simulator/simulator.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    DatabaseModule,
    TelemetryModule,
    SessionsModule,
    SimulatorModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
