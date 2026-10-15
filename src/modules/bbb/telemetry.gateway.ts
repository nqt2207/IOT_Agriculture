import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
})
export class TelemetryGateway {
  @WebSocketServer()
  server: Server;

  emitTelemetryUpdate(data: unknown): void {
    this.server.emit('telemetry:update', data);
  }
}