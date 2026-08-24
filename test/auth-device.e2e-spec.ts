import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { DeviceRepository } from '../src/device/device.repository';
import { DeviceTelemetryGateway } from '../src/device/device-telemetry.gateway';

const TEST_JWT_SECRET = 'websocket-e2e-secret';

describe('Device telemetry WebSocket authorization (e2e)', () => {
  let app: INestApplication;
  let gateway: DeviceTelemetryGateway;
  let jwtService: JwtService;
  let baseUrl: string;
  let clients: Socket[];

  const deviceRepository = {
    findOne: jest.fn(),
  };

  const delay = (milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  const waitForEvent = <T>(socket: Socket, event: string) =>
    new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${event}`)),
        2000,
      );

      socket.once(event, (payload: T) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });

  const connectClient = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(baseUrl, {
        auth: { token },
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
      });

      clients.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });

  const waitForDeviceLookup = async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (deviceRepository.findOne.mock.calls.length > 0) {
        return;
      }
      await delay(10);
    }

    throw new Error('Timed out waiting for device access check');
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [
          JwtModule.register({
            secret: TEST_JWT_SECRET,
            signOptions: { expiresIn: '1h' },
          }),
        ],
        providers: [
          DeviceTelemetryGateway,
          {
            provide: DeviceRepository,
            useValue: deviceRepository,
          },
        ],
      }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0, '127.0.0.1');

    gateway = moduleFixture.get(DeviceTelemetryGateway);
    jwtService = moduleFixture.get(JwtService);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    clients = [];
    jest.clearAllMocks();

    deviceRepository.findOne.mockResolvedValue({
      id: 'device-1',
      serialNumber: 'SN-1',
      userId: 2,
    });
  });

  afterEach(() => {
    for (const client of clients) {
      client.removeAllListeners();
      client.disconnect();
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects a connection without a JWT', async () => {
    const socket = io(baseUrl, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    clients.push(socket);

    const error = await waitForEvent<Error>(socket, 'connect_error');

    expect(error.message).toBe('UNAUTHORIZED');
    expect(socket.connected).toBe(false);
  });

  it('allows an owner to receive telemetry updates', async () => {
    const ownerToken = jwtService.sign({
      sub: 2,
      email: 'owner@example.com',
      role: 'USER',
    });
    const owner = await connectClient(ownerToken);

    const subscribed = waitForEvent<{ deviceId: string }>(
      owner,
      'device:subscribed',
    );
    owner.emit('device:subscribe', { deviceId: 'SN-1' });
    await expect(subscribed).resolves.toEqual({ deviceId: 'SN-1' });

    const telemetry = {
      deviceId: 'SN-1',
      timestamp: new Date().toISOString(),
      data: { temperature: 21.5 },
    };
    const update = waitForEvent(owner, 'telemetry:update');

    gateway.emitTelemetryUpdate(telemetry);

    await expect(update).resolves.toEqual(telemetry);
  });

  it('does not allow a user to join another user device room', async () => {
    const otherUserToken = jwtService.sign({
      sub: 3,
      email: 'other@example.com',
      role: 'USER',
    });
    const otherUser = await connectClient(otherUserToken);
    otherUser.emit('device:subscribe', { deviceId: 'SN-1' });
    await waitForDeviceLookup();
    await delay(20);

    const serverSocket = gateway.server.sockets.sockets.get(otherUser.id!);
    expect(serverSocket?.rooms.has('device:SN-1')).toBe(false);
  });

  it('does not deliver telemetry to another user', async () => {
    const otherUserToken = jwtService.sign({
      sub: 3,
      email: 'other@example.com',
      role: 'USER',
    });
    const otherUser = await connectClient(otherUserToken);
    const telemetryListener = jest.fn();
    otherUser.on('telemetry:update', telemetryListener);

    otherUser.emit('device:subscribe', { deviceId: 'SN-1' });
    await waitForDeviceLookup();
    await delay(20);

    gateway.emitTelemetryUpdate({
      deviceId: 'SN-1',
      timestamp: new Date().toISOString(),
      data: { temperature: 22 },
    });
    await delay(100);

    expect(telemetryListener).not.toHaveBeenCalled();
  });
});