import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeviceRepository } from './device.repository.js';

export type TelemetryPayload = {
  deviceId: string;
  timestamp: string | Date;
  data: Record<string, unknown>;
};

type SocketUser = {
  userId: number;
  role: string;
  email?: string;
};

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
export class DeviceTelemetryGateway implements OnGatewayInit {
  private readonly logger = new Logger(DeviceTelemetryGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly deviceRepository: DeviceRepository,
  ) {}

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server) {
    server.use(async (client, next) => {
      try {
        const rawToken = client.handshake.auth?.token;

        if (typeof rawToken !== 'string' || rawToken.length === 0) {
          throw new Error('Missing token');
        }

        const token = rawToken.startsWith('Bearer ')
          ? rawToken.slice(7)
          : rawToken;
        const payload = await this.jwtService.verifyAsync<{
          sub: number | string;
          role: string;
          email?: string;
        }>(token);
        const userId = Number(payload.sub);

        if (!Number.isInteger(userId) || !payload.role) {
          throw new Error('Invalid token payload');
        }

        client.data.user = {
          userId,
          role: payload.role,
          email: payload.email,
        } satisfies SocketUser;

        next();
      } catch {
        this.logger.warn(`Rejected unauthenticated WebSocket connection: ${client.id}`);
        next(new Error('UNAUTHORIZED'));
      }
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(
      `Connected ${client.id}. Active: ${this.server.sockets.sockets.size}`
    );
  }

  handleDisconnect(client: Socket) {
    this.logger.log(
      `Disconnected ${client.id}. Active: ${this.server.sockets.sockets.size}`
    );
  }

  @SubscribeMessage('device:subscribe')
  async handleDeviceSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId: string },
  ) {
    const user = client.data.user as SocketUser | undefined;
    const deviceId = body?.deviceId?.trim();

    if (!user) {
      throw new WsException('UNAUTHORIZED');
    }

    if (!deviceId) {
      throw new WsException('DEVICE_ID_REQUIRED');
    }

    const device = await this.deviceRepository.findOne({
      serialNumber: deviceId,
    });

    if (!device) {
      throw new WsException('DEVICE_NOT_FOUND');
    }

    if (user.role !== 'ADMIN' && device.userId !== user.userId) {
      this.logger.warn(
        `WebSocket device subscription denied. User ID: ${user.userId}, device: ${deviceId}`,
      );
      throw new WsException('FORBIDDEN');
    }

    const room = `device:${deviceId}`;

    await client.join(room);

    this.logger.log(`Client subscribed to WebSocket room: ${room}`);

    return {
      event: 'device:subscribed',
      data: {
        deviceId,
      },
    };
  }

  @SubscribeMessage('devices:subscribe_statuses')
  async handleStatusesSubscribe(@ConnectedSocket() client: Socket) {
    const user = client.data.user as SocketUser | undefined;

    if (!user) {
      throw new WsException('UNAUTHORIZED');
    }

    if (user.role !== 'ADMIN') {
      this.logger.warn(`Global statuses subscription denied for non-admin user ID: ${user.userId}`);
      throw new WsException('FORBIDDEN');
    }

    const room = 'devices:statuses';
    await client.join(room);
    this.logger.log(`Admin client subscribed to global room: ${room}`);
    return { event: 'devices:statuses_subscribed' };
  }

  emitTelemetryUpdate(telemetry: TelemetryPayload) {
    const room = `device:${telemetry.deviceId}`;
    this.server.to(room).emit('telemetry:update', telemetry);
    this.logger.debug(`Telemetry emitted to room: ${room}`);
  }

  emitStatusUpdate(deviceId: string, status: string) {
    const payload = { deviceId, status, timestamp: new Date() };

    this.server
      .to('devices:statuses')
      .to(`device:${deviceId}`)
      .emit('device:status_update', payload);

    this.logger.debug(`Status update [${status}] emitted for device: ${deviceId}`);
  }
}
