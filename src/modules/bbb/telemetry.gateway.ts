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

  /**
   * Gửi dữ liệu cảm biến mới nhất tới frontend.
   */
  emitTelemetryUpdate(data: unknown): void {
    this.server.emit('telemetry:update', data);
  }

  /**
   * Gửi trạng thái thiết bị tới frontend.
   * Ví dụ: pump1 ON, fan OFF.
   */
  emitActuatorState(data: unknown): void {
    this.server.emit('actuator:state', data);
  }
}