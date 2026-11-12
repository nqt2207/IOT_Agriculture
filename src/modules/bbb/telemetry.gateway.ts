
import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:5173',
      'https://iot-agriculture-frontend.onrender.com',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
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
   */
  emitActuatorState(data: unknown): void {
    this.server.emit('actuator:state', data);
  }

  /**
   * Gửi trạng thái bể nước tới frontend.
   */
  emitTankStatusUpdate(data: unknown): void {
    this.server.emit('tank:status', data);
  }
}
