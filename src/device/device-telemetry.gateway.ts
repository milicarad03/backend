import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

export type TelemetryPayload = {
  deviceId: string;
  timestamp: string | Date;
  data: Record<string, unknown>;
};

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
export class DeviceTelemetryGateway {
  @WebSocketServer()
  server!: Server;  

  @SubscribeMessage('device:subscribe')
  handleDeviceSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId: string },
  ) {
    const room = `device:${body.deviceId}`;

    client.join(room);

    console.log('[WS] Client subscribed to:', room);

    return {
      event: 'device:subscribed',
      data: {
        deviceId: body.deviceId,
      },
    };
  }

  emitTelemetryUpdate(telemetry: TelemetryPayload) {
    const room = `device:${telemetry.deviceId}`;

    this.server.to(room).emit('telemetry:update', telemetry);

    console.log('[WS] Telemetry emitted to room:', room);
  }
}