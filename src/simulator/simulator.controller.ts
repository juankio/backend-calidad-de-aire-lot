import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { z } from 'zod';
import { SimulatorService, type SimulationPhase } from './simulator.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

const SeedSimulateSchema = z
  .object({
    force: z.boolean().optional().default(true),
  })
  .optional();

const PhaseSimulateSchema = z.object({
  phase: z.enum(['OPTIMAL', 'WARNING_PREDICTIVE', 'CRITICAL', 'RECOVERY']).nullable(),
});

@Controller('simulate')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Get('status')
  getSimulationStatus(@Query('detailed') detailed?: string) {
    if (detailed === 'true' || detailed === '1') {
      const detailedStatus = this.simulatorService.getDetailedStatus();
      return {
        data: detailedStatus,
        message: 'Estado detallado del simulador',
      };
    }

    const status = this.simulatorService.getStatus();
    return {
      data: { running: status.running },
      message: 'Estado del simulador',
    };
  }

  @Post('toggle')
  @HttpCode(HttpStatus.OK)
  toggleSimulation(@Body() body: { enable?: boolean }) {
    const result = this.simulatorService.toggle(body?.enable);
    return {
      data: { running: result.running },
      message: result.message,
    };
  }

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  seedDefaultData(
    @Body(new ZodValidationPipe(SeedSimulateSchema as any))
    body?: { force?: boolean },
  ) {
    const result = this.simulatorService.seedDefaultLocations(body?.force ?? true);
    return {
      data: result,
      message: result.seeded
        ? 'Ubicaciones y datos quemados sembrados con éxito'
        : 'Base de datos ya contenía sesiones previas',
    };
  }

  @Post('phase')
  @HttpCode(HttpStatus.OK)
  setSimulationPhase(
    @Body(new ZodValidationPipe(PhaseSimulateSchema))
    body: { phase: SimulationPhase | null },
  ) {
    const result = this.simulatorService.setPhase(body.phase);
    return {
      data: result,
      message: body.phase
        ? `Fase forzada a ${body.phase}`
        : 'Fase automática reanudada',
    };
  }
}
