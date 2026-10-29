import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SerialLinkService } from './serial-link.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from 'zod';

const SerialCommandSchema = z.object({
  device_id: z.string().max(64).optional(),
  cmd: z.enum(['SET_EMOTION', 'GET_STATUS', 'CALIBRATE_MPU', 'SCAN_I2C', 'SET_LINK_MODE']),
  emotion: z.string().optional(),
  view_mode: z.enum(['FACE', 'HUD']).optional(),
  mode: z.enum(['LOCAL', 'WIFI']).optional(),
});

export type SerialCommandDto = z.infer<typeof SerialCommandSchema>;

@Controller('hardware')
export class HardwareController {
  constructor(private readonly serialLinkService: SerialLinkService) {}

  @Get('link')
  getLinkStatus() {
    return {
      success: true,
      data: this.serialLinkService.getStatus(),
      message: 'Estado del enlace por cable consultado',
      error: null,
    };
  }

  @Post('link/reconnect')
  @HttpCode(HttpStatus.OK)
  async reconnectLink() {
    const connected = await this.serialLinkService.connect();
    const status = this.serialLinkService.getStatus();
    return {
      success: connected,
      data: status,
      message: connected
        ? 'Enlace serie reconectado'
        : 'No se pudo reconectar el enlace serie',
      error: connected ? null : status.last_error,
    };
  }

  @Post('link/command')
  @HttpCode(HttpStatus.OK)
  sendSerialCommand(@Body(new ZodValidationPipe(SerialCommandSchema)) body: SerialCommandDto) {
    const deviceId = body.device_id || 'air-guardian-01';
    const delivered = this.serialLinkService.sendCommand(deviceId, body);
    return {
      success: delivered,
      data: { device_id: deviceId, ...body },
      message: delivered
        ? 'Comando entregado al nodo por el enlace serie'
        : 'Enlace serie no disponible: comando no entregado',
      error: delivered ? null : 'SERIAL_UNAVAILABLE',
    };
  }
}