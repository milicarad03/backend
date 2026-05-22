import { createDeviceDashboardConfig } from './device-dashboard.config';

describe('createDeviceDashboardConfig', () => {
  const mockDeviceRepository = {
    findOne: jest.fn(),
  };

  const mockDeviceTelemetryService = {
    handleTelemetry: jest.fn(),
  };

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
    );

    const result = await config.findDeviceById('sn-100');

    expect(mockDeviceRepository.findOne).toHaveBeenCalledWith({
      serialNumber: 'sn-100',
    });

    expect(result).toEqual({
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
    );

    await config.onTelemetry(telemetry);

    expect(mockDeviceTelemetryService.handleTelemetry).toHaveBeenCalledWith(
      telemetry,
    );
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
  );

  await expect(config.onTelemetry(telemetry)).rejects.toThrow('DATABASE_ERROR');

  expect(mockDeviceTelemetryService.handleTelemetry).toHaveBeenCalledWith(
    telemetry,
  );
 });
});