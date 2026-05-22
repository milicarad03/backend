import { Test, TestingModule } from '@nestjs/testing';
import { DeviceTelemetryService } from './device-telemetry.service';
import { DeviceRepository } from './device.repository';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';

describe('DeviceTelemetryService', () => {
  let service: DeviceTelemetryService;

  const mockDeviceRepository = {
    createTelemetry: jest.fn(),
    update: jest.fn(),
    findTelemetryByDeviceId: jest.fn(),
    findLatestTelemetryByDeviceId: jest.fn(),
  };

  const mockTelemetryGateway = {
    emitTelemetryUpdate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceTelemetryService,
        {
          provide: DeviceRepository,
          useValue: mockDeviceRepository,
        },
        {
          provide: DeviceTelemetryGateway,
          useValue: mockTelemetryGateway,
        },
      ],
    }).compile();

    service = module.get<DeviceTelemetryService>(DeviceTelemetryService);
  });

  it('should save telemetry, update lastseen and emit WebSocket update', async () => {
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

    const savedTelemetry = {
      id: 'telemetry-1',
      deviceId: 'sn-100',
      timestamp: new Date(telemetry.timestamp),
      data: telemetry.data,
      createdAt: new Date(),
    };

    mockDeviceRepository.createTelemetry.mockResolvedValue(savedTelemetry);
    mockDeviceRepository.update.mockResolvedValue({
      id: 'device-1',
      serialNumber: 'sn-100',
      lastseen: new Date(telemetry.timestamp),
    });

    const result = await service.handleTelemetry(telemetry);

    expect(mockDeviceRepository.createTelemetry).toHaveBeenCalledWith({
      deviceId: 'sn-100',
      timestamp: new Date(telemetry.timestamp),
      data: telemetry.data,
    });

    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: {
        serialNumber: 'sn-100',
      },
      data: {
        lastseen: new Date(telemetry.timestamp),
      },
    });

    expect(mockTelemetryGateway.emitTelemetryUpdate).toHaveBeenCalledWith({
      deviceId: 'sn-100',
      timestamp: savedTelemetry.timestamp,
      data: savedTelemetry.data,
    });

    expect(result).toEqual(savedTelemetry);
  });

  it('should return telemetry history for device', async () => {
    const history = [
      {
        id: 'telemetry-1',
        deviceId: 'sn-100',
        timestamp: new Date(),
        data: { temperature: 22.5 },
      },
    ];

    mockDeviceRepository.findTelemetryByDeviceId.mockResolvedValue(history);

    const result = await service.getTelemetryHistory('sn-100');

    expect(mockDeviceRepository.findTelemetryByDeviceId).toHaveBeenCalledWith('sn-100');
    expect(result).toEqual(history);
  });

  it('should return latest telemetry for device', async () => {
    const latest = {
      id: 'telemetry-1',
      deviceId: 'sn-100',
      timestamp: new Date(),
      data: { temperature: 22.5 },
    };

    mockDeviceRepository.findLatestTelemetryByDeviceId.mockResolvedValue(latest);

    const result = await service.getLatestTelemetry('sn-100');

    expect(mockDeviceRepository.findLatestTelemetryByDeviceId).toHaveBeenCalledWith('sn-100');
    expect(result).toEqual(latest);
  });
});