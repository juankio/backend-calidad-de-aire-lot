import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import type { TelemetryIngestDto } from '../telemetry/dto/telemetry.dto';

export type SimulationPhase = 'OPTIMAL' | 'WARNING_PREDICTIVE' | 'CRITICAL' | 'RECOVERY';

@Injectable()
export class SimulatorService implements OnModuleDestroy {
  private readonly logger = new Logger(SimulatorService.name);
  private simulationInterval: NodeJS.Timeout | null = null;
  private simPpm = 420;
  private simStep = 0;
  private currentPhase: SimulationPhase = 'OPTIMAL';
  private manualPhaseOverride: SimulationPhase | null = null;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Activa o desactiva la simulación ambiental en tiempo real.
   * Modela curvas fisiológicas reales con alternancia de estados emocionales de la mascota:
   * OPTIMAL -> WARNING_PREDICTIVE -> CRITICAL -> RECOVERY.
   */
  toggle(enable?: boolean) {
    const shouldEnable = enable ?? !this.simulationInterval;

    if (shouldEnable && !this.simulationInterval) {
      this.logger.log('🚀 Activando generador de telemetría IoT simulada con curvas realistas (2000ms)...');
      this.simStep = 0;

      this.simulationInterval = setInterval(() => {
        this.simStep++;
        const sample = this.generateRealisticSample();
        this.telemetryService.processAndBroadcast(sample, 'simulator');
      }, 2000);
      this.simulationInterval.unref?.();

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

  /**
   * Genera una muestra física y químicamente coherente siguiendo un ciclo de 4 fases
   */
  private generateRealisticSample(): TelemetryIngestDto {
    // Si hay un override manual de fase, usarlo; de lo contrario ciclar en 32 ticks (~64 segundos)
    const cycleStep = this.simStep % 32;

    if (this.manualPhaseOverride) {
      this.currentPhase = this.manualPhaseOverride;
    } else if (cycleStep < 10) {
      this.currentPhase = 'OPTIMAL';
    } else if (cycleStep < 18) {
      this.currentPhase = 'WARNING_PREDICTIVE';
    } else if (cycleStep < 25) {
      this.currentPhase = 'CRITICAL';
    } else {
      this.currentPhase = 'RECOVERY';
    }

    let targetPpm = 420;
    let deltaPpm = 0;
    let coPpm = 1.0;
    let temp = 23.8;
    let hum = 52.0;

    switch (this.currentPhase) {
      case 'OPTIMAL': {
        // Aire limpio, ambiente oxigenado y confortable
        const noise = Math.sin(this.simStep * 0.5) * 15 + (Math.random() * 8 - 4);
        targetPpm = 415 + noise;
        deltaPpm = Math.round((Math.random() * 6 - 3) * 10) / 10;
        coPpm = Math.round((0.8 + Math.random() * 0.8) * 10) / 10;
        temp = Math.round((23.4 + Math.random() * 0.4) * 10) / 10;
        hum = Math.round((52 + Math.random() * 2) * 10) / 10;
        break;
      }
      case 'WARNING_PREDICTIVE': {
        // Concentración en aumento rápido (delta > 35 ppm/min activa alerta predictiva)
        const progress = (cycleStep - 10) / 8.0;
        targetPpm = 650 + progress * 350 + (Math.random() * 20 - 10);
        deltaPpm = Math.round((42 + Math.random() * 15) * 10) / 10; // Delta alto > 35
        coPpm = Math.round((6.0 + progress * 8.0 + Math.random() * 1.5) * 10) / 10;
        temp = Math.round((24.8 + progress * 0.8) * 10) / 10;
        hum = Math.round((55 + progress * 4) * 10) / 10;
        break;
      }
      case 'CRITICAL': {
        // Peligro ambiental: PPM > 1400 o CO > 25 ppm activa alerta crítica
        const progress = (cycleStep - 18) / 7.0;
        targetPpm = 1420 + progress * 280 + (Math.random() * 30 - 15);
        deltaPpm = Math.round((10 + Math.random() * 20) * 10) / 10;
        coPpm = Math.round((27.0 + progress * 8.0 + Math.random() * 2.0) * 10) / 10; // CO > 25
        temp = Math.round((26.5 + Math.random() * 0.8) * 10) / 10;
        hum = Math.round((63 + Math.random() * 3) * 10) / 10;
        break;
      }
      case 'RECOVERY': {
        // Ventilación de emergencia: pendiente negativa fuerte (delta < -30 y PPM decreciente)
        const progress = (cycleStep - 25) / 7.0;
        targetPpm = 1200 - progress * 720 + (Math.random() * 15 - 7.5);
        deltaPpm = Math.round((-45 - Math.random() * 25) * 10) / 10; // Delta fuertemente negativo
        coPpm = Math.round((18.0 - progress * 15.0 + Math.random() * 1.0) * 10) / 10;
        temp = Math.round((25.5 - progress * 1.8) * 10) / 10;
        hum = Math.round((60 - progress * 8) * 10) / 10;
        break;
      }
    }

    this.simPpm = Math.max(380, Math.min(5000, targetPpm));
    const roundedPpm = Math.round(this.simPpm * 10) / 10;
    const rawAdc = Math.min(4095, Math.round(roundedPpm * 1.5 + (Math.random() * 15 - 7.5)));

    return {
      device_id: 'air-guardian-01',
      timestamp: Date.now(),
      ppm: roundedPpm,
      co_ppm: Math.max(0, coPpm),
      temperature: temp,
      humidity: Math.min(100, Math.max(0, hum)),
      delta_ppm: deltaPpm,
      raw_adc: rawAdc,
    };
  }

  /**
   * Forzar una fase de prueba específica ('OPTIMAL', 'WARNING_PREDICTIVE', 'CRITICAL', 'RECOVERY')
   * o pasar null para reanudar el ciclo automático.
   */
  setPhase(phase: SimulationPhase | null) {
    this.manualPhaseOverride = phase;
    if (phase) {
      this.currentPhase = phase;
    }
    return {
      current_phase: this.currentPhase,
      manual_override: !!this.manualPhaseOverride,
    };
  }

  /**
   * Siembra las ubicaciones por defecto y sus datos analíticos quemados
   */
  seedDefaultLocations(force = true) {
    return this.databaseService.seedDefaultLocationsAndData(force);
  }

  getStatus() {
    return {
      running: !!this.simulationInterval,
    };
  }

  getDetailedStatus() {
    return {
      running: !!this.simulationInterval,
      current_phase: this.currentPhase,
      current_ppm: Math.round(this.simPpm * 10) / 10,
      step_count: this.simStep,
      manual_override: this.manualPhaseOverride,
    };
  }

  onModuleDestroy() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }
}
