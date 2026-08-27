import { createDeviceDashboardConfig } from './device-dashboard.config';

describe('createDeviceDashboardConfig', () => {
  const mockDeviceRepository = {
    findOne: jest.fn(),
    updateAttributes: jest.fn(),
  };

  const mockDeviceTelemetryService = {
    handleTelemetry: jest.fn(),
    handleStatusChange: jest.fn(),
     getLatestTelemetry: jest.fn(),
  };
  const mockMqttPublisher = {
    publish: jest.fn(),
  };
    const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn().mockReturnThis(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return device data when device exists', async () => {
    const device = {
      id: 'device-1',
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
      userId: 1,
      isActive: true,
      createdAt: new Date(),
    };

    mockDeviceRepository.findOne.mockResolvedValue(device);

    const config = createDeviceDashboardConfig(
      mockDeviceRepository as any,
      mockDeviceTelemetryService as any,
      mockRedis,
      mockMqttPublisher as any,
    );

    const result = await config.findDeviceById('sn-100');

    expect(mockDeviceRepository.findOne).toHaveBeenCalledWith({
      serialNumber: 'sn-100',
    });

    expect(result).toMatchObject({
      id: 'device-1',
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
    });
  });

  it('should return null when device does not exist', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);

    const config = createDeviceDashboardConfig(
      mockDeviceRepository as any,
      mockDeviceTelemetryService as any,
      mockRedis,
      mockMqttPublisher as any,
    );

    const result = await config.findDeviceById('unknown-device');

    expect(mockDeviceRepository.findOne).toHaveBeenCalledWith({
      serialNumber: 'unknown-device',
    });

    expect(result).toBeNull();
  });

  it('should call handleTelemetry when telemetry is received', async () => {
    const telemetry = {
      deviceId: 'sn-100',
      timestamp: '2026-05-18T08:54:08.179Z',
      data: {
        temperature: 22.5,
        humidity: 45,
        pressure: 1012,
        led: false,
      },
    };

    mockDeviceTelemetryService.handleTelemetry.mockResolvedValue(undefined);

    const config = createDeviceDashboardConfig(
      mockDeviceRepository as any,
      mockDeviceTelemetryService as any,
      mockRedis,
      mockMqttPublisher as any,
    );

    await config.onTelemetry(telemetry);

    expect(mockDeviceTelemetryService.handleTelemetry).toHaveBeenCalledWith(
      telemetry,
    );
  });

  it('should persist validated attributes and invalidate the device cache', async () => {
    const attributes = {
      serialNumber: 'sn-100',
      firmware: '1.1.3',
      hardwareModel: 'modelC',
    };
    mockDeviceRepository.updateAttributes.mockResolvedValue({
      serialNumber: 'sn-100',
      attributes,
    });
    mockRedis.del.mockResolvedValue(1);

    const config = createDeviceDashboardConfig(
      mockDeviceRepository as any,
      mockDeviceTelemetryService as any,
      mockRedis,
      mockMqttPublisher as any,
    );

    await config.onAttributes('sn-100', attributes);

    expect(mockDeviceRepository.updateAttributes).toHaveBeenCalledWith(
      'sn-100',
      attributes,
    );
    expect(mockRedis.del).toHaveBeenCalledWith(
      'cache:device:sn-100',
    );
  });

  it('should reject attributes without a device identifier', async () => {
    const config = createDeviceDashboardConfig(
      mockDeviceRepository as any,
      mockDeviceTelemetryService as any,
      mockRedis,
      mockMqttPublisher as any,
    );

    await expect(
      config.onAttributes('', { firmware: '1.1.3' }),
    ).rejects.toThrow('INVALID_DEVICE_ATTRIBUTES');
    expect(mockDeviceRepository.updateAttributes).not.toHaveBeenCalled();
  });

  

  it('should propagate error when telemetry handling fails', async () => {
  const telemetry = {
    deviceId: 'sn-100',
    timestamp: '2026-05-18T08:54:08.179Z',
    data: {
      temperature: 22.5,
    },
  };

  const error = new Error('DATABASE_ERROR');

  mockDeviceTelemetryService.handleTelemetry.mockRejectedValue(error);

  const config = createDeviceDashboardConfig(
    mockDeviceRepository as any,
    mockDeviceTelemetryService as any,
    mockRedis,
    mockMqttPublisher as any,
  );

  await expect(config.onTelemetry(telemetry)).rejects.toThrow('DATABASE_ERROR');

  expect(mockDeviceTelemetryService.handleTelemetry).toHaveBeenCalledWith(
    telemetry,
  );
 });

  it('should return null when serial number is null or undefined', async () => {
      const config = createDeviceDashboardConfig(
        mockDeviceRepository as any,
        mockDeviceTelemetryService as any,
        mockRedis,
        mockMqttPublisher as any,
      );

    
      const resultNull = await config.findDeviceById(null as any);
      expect(resultNull).toBeNull();

 
      const resultUndefined = await config.findDeviceById(undefined as any);
      expect(resultUndefined).toBeNull();

     
      expect(mockDeviceRepository.findOne).not.toHaveBeenCalled();
    });
    it('should propagate error when findDeviceById database lookup fails', async () => {
    
      mockDeviceRepository.findOne.mockRejectedValue(new Error('DB_TIMEOUT'));

      const config = createDeviceDashboardConfig(
        mockDeviceRepository as any,
        mockDeviceTelemetryService as any,
        mockRedis,
        mockMqttPublisher as any,
      );

      
      await expect(config.findDeviceById('sn-100')).rejects.toThrow('DB_TIMEOUT');
    });

    it('should handle telemetry even if data object is empty', async () => {
      const telemetry = {
        deviceId: 'sn-100',
        timestamp: '2026-05-18T08:54:08.179Z',
        data: {}, 
      };

      mockDeviceTelemetryService.handleTelemetry.mockResolvedValue(undefined);

      const config = createDeviceDashboardConfig(
        mockDeviceRepository as any,
        mockDeviceTelemetryService as any,
        mockRedis,
        mockMqttPublisher as any,
      );

      await expect(config.onTelemetry(telemetry)).resolves.not.toThrow();
      expect(mockDeviceTelemetryService.handleTelemetry).toHaveBeenCalledWith(telemetry);
    });

    it('should throw or handle error if telemetry is missing deviceId', async () => {
      const invalidTelemetry = {
        timestamp: '2026-05-18T08:54:08.179Z',
        data: { temp: 20 },
      } as any;

      const config = createDeviceDashboardConfig(
        mockDeviceRepository as any,
        mockDeviceTelemetryService as any,
        mockRedis,
        mockMqttPublisher as any,
      );
      await expect(config.onTelemetry(invalidTelemetry)).rejects.toThrow();
    });
    it('should forward status change to telemetry service', async () => {
      mockDeviceTelemetryService.handleStatusChange = jest
        .fn()
        .mockResolvedValue(undefined);

      const config = createDeviceDashboardConfig(
        mockDeviceRepository as any,
        mockDeviceTelemetryService as any,
        mockRedis,
        mockMqttPublisher as any,
      );

      await config.onStatusChange('sn-100', 'ONLINE');

      expect(
        mockDeviceTelemetryService.handleStatusChange,
      ).toHaveBeenCalledWith(
        'sn-100',
        'ONLINE',
      );
    });
  it('should publish command through mqtt publisher', async () => {
    const config = createDeviceDashboardConfig(
      mockDeviceRepository as any,
      mockDeviceTelemetryService as any,
      mockRedis,
      mockMqttPublisher as any,
    );

    await config.sendCommand(
      'sn-100',
      'SET_LED',
      { value: true },
    );

    expect(
      mockMqttPublisher.publish,
    ).toHaveBeenCalledWith(
      'command',
      'sn-100',
      {
        command: 'SET_LED',
        payload: { value: true },
      },
    );
  });
  it('should include the audit correlation ID in the MQTT command', async () => {
    const config = createDeviceDashboardConfig(
      mockDeviceRepository as any,
      mockDeviceTelemetryService as any,
      mockRedis,
      mockMqttPublisher as any,
    );

    await config.sendCommand(
      'sn-100',
      'SET_LED',
      { value: true },
      { correlationId: 'audit-correlation-1' },
    );

    expect(mockMqttPublisher.publish).toHaveBeenCalledWith(
      'command',
      'sn-100',
      {
        command: 'SET_LED',
        payload: { value: true },
        correlationId: 'audit-correlation-1',
      },
    );
  });
  it('should return latest telemetry from telemetry service', async () => {
    const latest = {
      deviceId: 'sn-100',
      data: {
        temperature: 20,
      },
    };

    mockDeviceTelemetryService.getLatestTelemetry.mockResolvedValue(
      latest,
    );

    const config = createDeviceDashboardConfig(
      mockDeviceRepository as any,
      mockDeviceTelemetryService as any,
      mockRedis,
      mockMqttPublisher as any,
    );

    const result =
      await config.getLatestTelemetry('sn-100');

    expect(
      mockDeviceTelemetryService.getLatestTelemetry,
    ).toHaveBeenCalledWith('sn-100');

    expect(result).toEqual(latest);
  });


  
});