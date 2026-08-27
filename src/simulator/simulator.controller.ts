import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SimulatorService } from './simulator.service';

@Controller('simulate')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Post('toggle')
  @HttpCode(HttpStatus.OK)
  toggleSimulation(@Body() body: { enable?: boolean }) {
    const result = this.simulatorService.toggle(body?.enable);
    return {
      data: { running: result.running },
      message: result.message,
    };
  }
}
