import { Test, TestingModule } from '@nestjs/testing';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';
import { Socket, Server } from 'socket.io';

describe('DeviceTelemetryGateway', () => {
  let gateway: DeviceTelemetryGateway;
  let mockServer: any;
  let mockSocket: any;

  beforeEach(async () => {
    mockSocket = {
      join: jest.fn(),
    } as unknown as Socket;

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as unknown as Server;

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceTelemetryGateway],
    }).compile();

    gateway = module.get<DeviceTelemetryGateway>(DeviceTelemetryGateway);
    
    gateway.server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should join device room on device:subscribe', () => {
    const body = { deviceId: 'dev-123' };
    const result = gateway.handleDeviceSubscribe(mockSocket, body);

    expect(mockSocket.join).toHaveBeenCalledWith('device:dev-123');
    expect(result).toEqual({
      event: 'device:subscribed',
      data: { deviceId: 'dev-123' },
    });
  });

  it('should emit telemetry to specific device room', () => {
    const telemetry = {
      deviceId: 'dev-123',
      timestamp: new Date(),
      data: { temp: 25 },
    };

    gateway.emitTelemetryUpdate(telemetry);

    expect(mockServer.to).toHaveBeenCalledWith('device:dev-123');
    expect(mockServer.emit).toHaveBeenCalledWith('telemetry:update', telemetry);
  });

  it('should emit status update to global room and specific device room', () => {
    gateway.emitStatusUpdate('dev-123', 'online');

    
    expect(mockServer.to).toHaveBeenCalledWith('devices:statuses');
    expect(mockServer.to).toHaveBeenCalledWith('device:dev-123');
    expect(mockServer.emit).toHaveBeenNthCalledWith(
    1,
    'device:status_update',
    expect.objectContaining({ deviceId: 'dev-123' })
    );

    expect(mockServer.emit).toHaveBeenNthCalledWith(
    2,
    'device:status_update',
    expect.objectContaining({ deviceId: 'dev-123' })
    );
  });
  it('should join global statuses room', () => {
  const result = gateway.handleStatusesSubscribe(mockSocket);

  expect(mockSocket.join).toHaveBeenCalledWith('devices:statuses');
  expect(result).toEqual({ event: 'devices:statuses_subscribed' });
});
});