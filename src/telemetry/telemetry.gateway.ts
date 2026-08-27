import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server } from 'ws';
import { WebSocket } from 'ws';

interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
}

@WebSocketGateway({ path: '/' })
export class TelemetryGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(TelemetryGateway.name);
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly clients = new Set<ExtendedWebSocket>();

  @WebSocketServer()
  server!: Server;

  afterInit() {
    this.logger.log('📡 WebSocket Telemetry Gateway inicializado.');
    this.startHeartbeat();
  }

  handleConnection(client: ExtendedWebSocket) {
    client.isAlive = true;
    this.clients.add(client);

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('error', (err) => {
      this.logger.error(`[WebSocket Client Error] ${err.message}`);
      this.clients.delete(client);
    });

    try {
      client.send(
        JSON.stringify({
          type: 'CONNECTION_ACK',
          message: 'Conectado al stream de telemetría IoT',
        }),
      );
    } catch (err) {
      this.logger.error('Error enviando CONNECTION_ACK al cliente', err);
      this.clients.delete(client);
    }
  }

  handleDisconnect(client: ExtendedWebSocket) {
    this.clients.delete(client);
  }

  broadcastTelemetry(payload: any) {
    const msg = JSON.stringify({
      type: 'TELEMETRY_UPDATE',
      payload,
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch (err) {
          this.clients.delete(client);
          try {
            client.terminate();
          } catch (_) {}
        }
      } else if (
        client.readyState === WebSocket.CLOSED ||
        client.readyState === WebSocket.CLOSING
      ) {
        this.clients.delete(client);
      }
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.clients) {
        if (ws.isAlive === false) {
          this.clients.delete(ws);
          try {
            ws.terminate();
          } catch (_) {}
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (_) {
          this.clients.delete(ws);
        }
      }
    }, 30000);
  }

  onModuleDestroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
