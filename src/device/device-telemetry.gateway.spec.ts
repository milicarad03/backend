import { Test, TestingModule } from '@nestjs/testing';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';
import { Socket, Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { DeviceRepository } from './device.repository';
import { WsException } from '@nestjs/websockets';

describe('DeviceTelemetryGateway', () => {
    let gateway: DeviceTelemetryGateway;
    let mockServer: any;
    let mockSocket: any;

    const mockJwtService = {
      verifyAsync: jest.fn(),
    };

    const mockDeviceRepository = {
      findOne: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();

      mockSocket = {
        join: jest.fn(),
        data: {
          user: {
            userId: 2,
            role: 'USER',
          },
        },
      } as unknown as Socket;

      mockServer = {
        use: jest.fn(),
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as unknown as Server;

      mockDeviceRepository.findOne.mockResolvedValue({
        id: 'device-1',
        serialNumber: 'dev-123',
        userId: 2,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DeviceTelemetryGateway,
          {
            provide: JwtService,
            useValue: mockJwtService,
          },
          {
            provide: DeviceRepository,
            useValue: mockDeviceRepository,
          },
        ],
      }).compile();

      gateway = module.get<DeviceTelemetryGateway>(DeviceTelemetryGateway);
      
      gateway.server = mockServer;
    });

    it('should be defined', () => {
      expect(gateway).toBeDefined();
    });

    it('should join device room on device:subscribe', async () => {
      const body = { deviceId: 'dev-123' };
      const result = await gateway.handleDeviceSubscribe(mockSocket, body);

      expect(mockDeviceRepository.findOne).toHaveBeenCalledWith({
        serialNumber: 'dev-123',
      });
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

    it('should reject subscription with missing deviceId', async () => {
      await expect(
        gateway.handleDeviceSubscribe(mockSocket, { deviceId: '' }),
      ).rejects.toThrow(WsException);

      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should reject subscription to another user device', async () => {
      mockDeviceRepository.findOne.mockResolvedValue({
        id: 'device-2',
        serialNumber: 'dev-123',
        userId: 99,
      });

      await expect(
        gateway.handleDeviceSubscribe(mockSocket, { deviceId: 'dev-123' }),
      ).rejects.toThrow('FORBIDDEN');

      expect(mockSocket.join).not.toHaveBeenCalled();
    });
    it('should emit status update to both rooms', () => {
      gateway.emitStatusUpdate('dev-123', 'online');


      expect(mockServer.to).toHaveBeenCalledWith('devices:statuses');
      expect(mockServer.to).toHaveBeenCalledWith('device:dev-123');
      
    
      expect(mockServer.emit).toHaveBeenCalledTimes(2);
      expect(mockServer.emit).toHaveBeenCalledWith('device:status_update', expect.objectContaining({ 
        deviceId: 'dev-123', 
        status: 'online' 
      }));
    });
    it('should handle error if client fails to join room', async () => {
      mockSocket.join.mockImplementationOnce(() => {
        throw new Error('SOCKET_JOIN_FAILED');
      });

      mockDeviceRepository.findOne.mockResolvedValue({
        id: 'device-1',
        serialNumber: '123',
        userId: 2,
      });

      await expect(
        gateway.handleDeviceSubscribe(mockSocket, { deviceId: '123' }),
      ).rejects.toThrow('SOCKET_JOIN_FAILED');
    });

    it('should not throw if server.to returns an object without active sockets', () => {
  
      mockServer.to.mockReturnValue({
        emit: jest.fn(),
      });

      expect(() => {
        gateway.emitTelemetryUpdate({
          deviceId: 'unknown-device',
          timestamp: new Date(),
          data: {}
        });
      }).not.toThrow();
    });
    it('should handle telemetry with null or undefined data field', () => {
      const telemetry = {
        deviceId: 'dev-123',
        timestamp: new Date(),
        data: null as any, 
      };

      expect(() => gateway.emitTelemetryUpdate(telemetry)).not.toThrow();
    });
    it('should handle exceptionally long deviceId', async () => {
      const longId = 'a'.repeat(1000);
      mockDeviceRepository.findOne.mockResolvedValue({
        id: 'device-1',
        serialNumber: longId,
        userId: 2,
      });

      await gateway.handleDeviceSubscribe(mockSocket, { deviceId: longId });

      expect(mockSocket.join).toHaveBeenCalledWith(`device:${longId}`);
    });
    it('should allow admin to join global statuses room', () => {
      mockSocket.data.user.role = 'ADMIN';
      const result = gateway.handleStatusesSubscribe(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('devices:statuses');
      expect(result).toEqual({ event: 'devices:statuses_subscribed' });
    });

    it('should reject non-admin user from joining global statuses room', () => {
      mockSocket.data.user.role = 'USER';
      
      expect(() => gateway.handleStatusesSubscribe(mockSocket)).toThrow('FORBIDDEN');
      expect(mockSocket.join).not.toHaveBeenCalled();
    });
});