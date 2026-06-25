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


    it('should join global statuses room', () => {
      const result = gateway.handleStatusesSubscribe(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('devices:statuses');
      expect(result).toEqual({ event: 'devices:statuses_subscribed' });
    });

    it('should handle subscription with missing deviceId', () => {
      const body = { deviceId: '' }; 
      const result = gateway.handleDeviceSubscribe(mockSocket, body);

    
      expect(mockSocket.join).toHaveBeenCalledWith('device:');
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
    it('should handle error if client fails to join room', () => {
      mockSocket.join.mockImplementationOnce(() => {
        throw new Error('SOCKET_JOIN_FAILED');
      });

      
      expect(() => gateway.handleDeviceSubscribe(mockSocket, { deviceId: '123' }))
        .toThrow('SOCKET_JOIN_FAILED');
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
    it('should handle exceptionally long deviceId', () => {
      const longId = 'a'.repeat(1000);
      const result = gateway.handleDeviceSubscribe(mockSocket, { deviceId: longId });

      expect(mockSocket.join).toHaveBeenCalledWith(`device:${longId}`);
    });
});