import { Test, TestingModule } from '@nestjs/testing';
import { DeviceTelemetryService } from './device-telemetry.service';
import { DeviceRepository } from './device.repository';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { InvalidTimestampException } from 'serverplugin';

describe('DeviceTelemetryService', () => {
  let service: DeviceTelemetryService;

  const mockDeviceRepository = {
    createTelemetry: jest.fn(),
    update: jest.fn(),
    findTelemetryByDeviceId: jest.fn(),
    findLatestTelemetryByDeviceId: jest.fn(),
    findOne: jest.fn(), 
    deleteOldTelemetryForDevice: jest.fn(),
    findStaleOnlineDevices: jest.fn(),
    markOfflineIfStale: jest.fn(),
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
      data: {
        temperature: [[22.5, telemetry.timestamp]],
        humidity: [[45, telemetry.timestamp]],
        pressure: [[1012, telemetry.timestamp]],
        led: [[false, telemetry.timestamp]],
      },
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
      data: {
        temperature: [[22.5, telemetry.timestamp]],
        humidity: [[45, telemetry.timestamp]],
        pressure: [[1012, telemetry.timestamp]],
        led: [[false, telemetry.timestamp]],
      },
      modelVersionId: undefined,
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
        data: { temperature: [[22.5, '2026-05-18T08:54:08.179Z']] },
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
      data: { temperature: [[22.5, '2026-05-18T08:54:08.179Z']] },
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
        telemetryStateUpdatedAt: null,
      },
    });
    expect(mockTelemetryGateway.emitStatusUpdate).toHaveBeenCalledWith('sn-100', 'OFFLINE');
  });

  it('marks only devices that are still stale as OFFLINE', async () => {
    const cutoff = new Date('2026-09-01T12:00:00.000Z');
    mockDeviceRepository.findStaleOnlineDevices.mockResolvedValue([
      { serialNumber: 'stale-1', lastseen: new Date('2026-09-01T11:59:00.000Z') },
      { serialNumber: 'recovered-1', lastseen: new Date('2026-09-01T11:59:10.000Z') },
    ]);
    mockDeviceRepository.markOfflineIfStale
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.markStaleDevicesOffline(cutoff),
    ).resolves.toEqual(['stale-1']);

    expect(mockDeviceRepository.markOfflineIfStale).toHaveBeenCalledWith(
      'stale-1',
      cutoff,
    );
    expect(mockDeviceRepository.markOfflineIfStale).toHaveBeenCalledWith(
      'recovered-1',
      cutoff,
    );
    expect(mockTelemetryGateway.emitStatusUpdate).toHaveBeenCalledWith(
      'stale-1',
      'OFFLINE',
    );
    expect(mockTelemetryGateway.emitStatusUpdate).not.toHaveBeenCalledWith(
      'recovered-1',
      'OFFLINE',
    );
  });

  it('refreshes lastseen without emitting a duplicate ONLINE event for a heartbeat', async () => {
    mockDeviceRepository.findOne.mockResolvedValue({
      id: 'device-1',
      status: 'ONLINE',
    });
    mockDeviceRepository.update.mockResolvedValue({});

    await service.handleStatusChange('sn-100', 'ONLINE', {
      heartbeat: true,
    });

    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: { serialNumber: 'sn-100' },
      data: {
        status: 'ONLINE',
        lastseen: expect.any(Date),
        telemetryStateUpdatedAt: null,
      },
    });
    expect(mockTelemetryGateway.emitStatusUpdate).not.toHaveBeenCalled();
  });

  it('emits ONLINE when a heartbeat revives an OFFLINE device', async () => {
    mockDeviceRepository.findOne.mockResolvedValue({
      id: 'device-1',
      status: 'OFFLINE',
    });
    mockDeviceRepository.update.mockResolvedValue({});

    await service.handleStatusChange('sn-100', 'ONLINE', {
      heartbeat: true,
    });

    expect(mockTelemetryGateway.emitStatusUpdate).toHaveBeenCalledWith(
      'sn-100',
      'ONLINE',
    );
  });

  it('persists a telemetry state confirmed by the device', async () => {
    mockDeviceRepository.update.mockResolvedValue({});

    await service.handleTelemetryStateChange(
      'sn-100',
      'ACTIVE',
      '2026-08-27T12:00:00.000Z',
    );

    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: { serialNumber: 'sn-100' },
      data: {
        telemetryState: 'ACTIVE',
        telemetryStateUpdatedAt: new Date(
          '2026-08-27T12:00:00.000Z',
        ),
        lastseen: new Date('2026-08-27T12:00:00.000Z'),
      },
    });
  });

  it('rejects an invalid telemetry state timestamp', async () => {
    await expect(
      service.handleTelemetryStateChange(
        'sn-100',
        'IDLE',
        'invalid-date',
      ),
    ).rejects.toThrow(InvalidTimestampException);

    expect(mockDeviceRepository.update).not.toHaveBeenCalled();
  });

  it('should skip status change if device does not exist', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);

    await service.handleStatusChange('non-existent', 'ONLINE');

    expect(mockDeviceRepository.update).not.toHaveBeenCalled();
  });

  it('should merge new telemetry data with previous data', async () => {
    const oldData = { temperature: 20 };
    const newData = { humidity: 50 };
    const timestamp = '2026-05-18T08:54:08.179Z';
    
    mockDeviceRepository.findOne.mockResolvedValue({ isVerified: true });
    mockDeviceRepository.findLatestTelemetryByDeviceId.mockResolvedValue({ data: oldData });
    mockDeviceRepository.createTelemetry.mockResolvedValue({ data: { temperature: 20, humidity: [[50, timestamp]] } });

    await service.handleTelemetry({
      deviceId: 'sn-100',
      timestamp,
      data: newData
    });

    expect(mockDeviceRepository.createTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          humidity: [[50, timestamp]]
        })
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

  it('should throw an InvalidTimestampException if timestamp is invalid', async () => {
    mockDeviceRepository.findOne.mockResolvedValue({ isVerified: true });
    
    const badTelemetry = {
      deviceId: 'sn-100',
      timestamp: 'not-a-date',
      data: { temp: 20 }
    };
    await expect(service.handleTelemetry(badTelemetry as any)).rejects.toThrow(InvalidTimestampException);
  });

  it('should allow overwriting telemetry fields with null if needed', async () => {
    const oldData = { temperature: 20, status: 'ok' };
    const newData = { temperature: null };
    const timestamp = '2026-05-18T08:54:08.179Z';
    
    mockDeviceRepository.findOne.mockResolvedValue({ isVerified: true });
    mockDeviceRepository.findLatestTelemetryByDeviceId.mockResolvedValue({ data: oldData });
    mockDeviceRepository.createTelemetry.mockResolvedValue({ data: { temperature: [[null, timestamp]], status: 'ok' } });

    await service.handleTelemetry({
      deviceId: 'sn-100',
      timestamp,
      data: newData as any
    });

    expect(mockDeviceRepository.createTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          temperature: [[null, timestamp]]
        })
      })
    );
  });
  
  it('should log error if status update fails in DB', async () => {
    mockDeviceRepository.findOne.mockResolvedValue({ id: 'device-1' });
    mockDeviceRepository.update.mockRejectedValue(new Error('DB_FAILED'));

    await expect(service.handleStatusChange('sn-100', 'OFFLINE')).rejects.toThrow('DB_FAILED');
  });
});
