import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { TelemetryService } from '../telemetry/telemetry.service';
import type { TelemetryIngestDto } from '../telemetry/dto/telemetry.dto';

@Injectable()
export class SimulatorService implements OnModuleDestroy {
  private readonly logger = new Logger(SimulatorService.name);
  private simulationInterval: NodeJS.Timeout | null = null;
  private simPpm = 410;
  private simTrend = 1;

  constructor(private readonly telemetryService: TelemetryService) {}

  toggle(enable?: boolean) {
    const shouldEnable = enable ?? !this.simulationInterval;

    if (shouldEnable && !this.simulationInterval) {
      this.logger.log('🚀 Activando generador de telemetría IoT simulada (2000ms)...');
      this.simulationInterval = setInterval(() => {
        if (this.simPpm > 1300) this.simTrend = -1;
        if (this.simPpm < 420) this.simTrend = 1;
        this.simPpm += this.simTrend * (10 + Math.random() * 25);

        const sample: TelemetryIngestDto = {
          device_id: 'air-guardian-01',
          timestamp: Date.now(),
          ppm: Math.round(this.simPpm * 10) / 10,
          co_ppm: Math.round((this.simPpm / 70.0) * 10) / 10,
          temperature: 24.2 + (Math.random() * 0.4 - 0.2),
          humidity: 56 + (Math.random() * 2 - 1),
          delta_ppm: this.simTrend * 15,
          raw_adc: Math.round(this.simPpm * 1.5),
        };

        this.telemetryService.processAndBroadcast(sample);
      }, 2000);

      return {
        running: true,
        message: 'Simulador ambiental en tiempo real ACTIVADO',
      };
    } else if (!shouldEnable && this.simulationInterval) {
      this.logger.log('🛑 Desactivando simulador ambiental...');
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;

      return {
        running: false,
        message: 'Simulador ambiental DESACTIVADO',
      };
    }

    return {
      running: !!this.simulationInterval,
      message: 'Estado del simulador ambiental',
    };
  }

  getStatus() {
    return {
      running: !!this.simulationInterval,
    };
  }

  onModuleDestroy() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }
}
