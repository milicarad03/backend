import { Test, TestingModule } from '@nestjs/testing';
import { DeviceTelemetryService } from './device-telemetry.service';
import { DeviceRepository } from './device.repository';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';

import { NotFoundException,ForbiddenException } from '@nestjs/common';

describe('DeviceTelemetryService', () => {
  let service: DeviceTelemetryService;

  const mockDeviceRepository = {
    createTelemetry: jest.fn(),
    update: jest.fn(),
    findTelemetryByDeviceId: jest.fn(),
    findLatestTelemetryByDeviceId: jest.fn(),
    findOne: jest.fn(), 
    deleteOldTelemetryForDevice: jest.fn(),
  };

  const mockTelemetryGateway = {
    emitTelemetryUpdate: jest.fn(),
    emitStatusUpdate: jest.fn(),
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
    mockDeviceRepository.findOne.mockResolvedValue({ 
      isVerified: true 
    });

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
    expect(mockDeviceRepository.deleteOldTelemetryForDevice).toHaveBeenCalledWith('sn-100', 5);

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
        status: 'ONLINE', 
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

  it('should throw NotFoundException if device does not exist', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);

    await expect(service.handleTelemetry({
      deviceId: 'unknown',
      timestamp: '2026-05-18T08:54:08.179Z',
      data: {}
    })).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException if device is not verified', async () => {
    mockDeviceRepository.findOne.mockResolvedValue({ isVerified: false });

    await expect(service.handleTelemetry({
      deviceId: 'sn-100',
      timestamp: '2026-05-18T08:54:08.179Z',
      data: {}
    })).rejects.toThrow(ForbiddenException);
  });


  it('should handle status change and emit update', async () => {
    mockDeviceRepository.findOne.mockResolvedValue({ id: 'device-1' });
    mockDeviceRepository.update.mockResolvedValue({});

    await service.handleStatusChange('sn-100', 'OFFLINE');

    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: { serialNumber: 'sn-100' },
      data: {
        status: 'OFFLINE',
        lastseen: expect.any(Date),
      },
    });
    expect(mockTelemetryGateway.emitStatusUpdate).toHaveBeenCalledWith('sn-100', 'OFFLINE');
  });

  it('should skip status change if device does not exist', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);

    await service.handleStatusChange('non-existent', 'ONLINE');

    expect(mockDeviceRepository.update).not.toHaveBeenCalled();
  });

  it('should merge new telemetry data with previous data', async () => {
    const oldData = { temperature: 20 };
    const newData = { humidity: 50 };
    
    mockDeviceRepository.findOne.mockResolvedValue({ isVerified: true });
    mockDeviceRepository.findLatestTelemetryByDeviceId.mockResolvedValue({ data: oldData });
    mockDeviceRepository.createTelemetry.mockResolvedValue({ data: { ...oldData, ...newData } });

    await service.handleTelemetry({
      deviceId: 'sn-100',
      timestamp: '2026-05-18T08:54:08.179Z',
      data: newData
    });

    expect(mockDeviceRepository.createTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { temperature: 20, humidity: 50 }
      })
    );
  });

  it('should pass modelVersionId if present on device', async () => {
    const deviceWithModel = { isVerified: true, modelVersionId: 'v123' };
    mockDeviceRepository.findOne.mockResolvedValue(deviceWithModel);
    mockDeviceRepository.createTelemetry.mockResolvedValue({ id: 't1' });
    mockDeviceRepository.update.mockResolvedValue({});

    await service.handleTelemetry({
      deviceId: 'sn-100',
      timestamp: '2026-05-18T08:54:08.179Z',
      data: { temp: 20 }
    });

    expect(mockDeviceRepository.createTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        modelVersionId: 'v123'
      })
    );
  });
  
  it('should throw an error if database fails to save telemetry', async () => {
    mockDeviceRepository.findOne.mockResolvedValue({ isVerified: true });
    mockDeviceRepository.createTelemetry.mockRejectedValue(new Error('DB_DOWN'));

    await expect(service.handleTelemetry({
      deviceId: 'sn-100',
      timestamp: '2026-05-18T08:54:08.179Z',
      data: { temp: 20 }
    })).rejects.toThrow('DB_DOWN');
  });

  it('should handle empty telemetry data gracefully', async () => {
    
    mockDeviceRepository.createTelemetry.mockResolvedValue({ id: 't1' }); 
    mockDeviceRepository.findOne.mockResolvedValue({ isVerified: true });
    mockDeviceRepository.update.mockResolvedValue({});

  
    await expect(service.handleTelemetry({
      deviceId: 'sn-100',
      timestamp: '2026-05-18T08:54:08.179Z',
      data: {}
    })).resolves.not.toThrow();
  });

});