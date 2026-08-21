import { Test, TestingModule } from '@nestjs/testing';
import {ConflictException,ForbiddenException,InternalServerErrorException,NotFoundException} from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceRepository } from './device.repository';
import { DeviceDashboardService } from 'serverplugin';
import { MqttTransportService } from '../mqtt/mqtt-transport.service';
import { DeviceStatus } from '../generated/prisma/client';

describe('DeviceService', () => {
  let service: DeviceService;

  const mockDeviceRepository = {
    findOne: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createTelemetry: jest.fn(),
    findModelVersionById: jest.fn()
  };

  const mockDashboardPlugin = {
    checkDevice: jest.fn(),
    invalidateDeviceCache: jest.fn()
  };

  const mockMqttTransportService = {
    sendCommandAndWaitForResponse: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        {
          provide: DeviceRepository,
          useValue: mockDeviceRepository,
        },
        {
          provide: DeviceDashboardService,
          useValue: mockDashboardPlugin,
        },
        {
          provide: MqttTransportService,
          useValue: mockMqttTransportService,
        },
      ],
    }).compile();

    service = module.get<DeviceService>(DeviceService);
  });

  it('should create device for target user when targetUserId is provided', async () => {
    const createDeviceDto = {
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
      targetUserId: 5,
      modelVersionId: '95895489034859038490'
    };

    const createdDevice = {
      id: 'device-1',
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
      userId: 5,
      isActive: true,
      createdAt: new Date(),
    };

    mockDeviceRepository.create.mockResolvedValue(createdDevice);

    const result = await service.createDevice(1, createDeviceDto);

    expect(mockDeviceRepository.create).toHaveBeenCalledWith({
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
      user: {
        connect: { id: 5 },
      },
      modelVersion: { connect: { id: '95895489034859038490' } }
    });

    expect(result).toEqual(createdDevice);
  });

  it('should create device for current user when targetUserId is not provided', async () => {
    const createDeviceDto = {
      serialNumber: 'sn-101',
      name: 'Humidity Sensor',
      type: 'HUMIDITY_SENSOR',
      modelVersionId: '95895489034859038490'
    };

    const createdDevice = {
      id: 'device-2',
      serialNumber: 'sn-101',
      name: 'Humidity Sensor',
      type: 'HUMIDITY_SENSOR',
      userId: 1,
      isActive: true,
      createdAt: new Date(),
      modelVersionId: '95895489034859038490'
    };

    mockDeviceRepository.create.mockResolvedValue(createdDevice);

    const result = await service.createDevice(1, createDeviceDto);

    expect(mockDeviceRepository.create).toHaveBeenCalledWith({
      serialNumber: 'sn-101',
      name: 'Humidity Sensor',
      type: 'HUMIDITY_SENSOR',
      user: {
        connect: { id: 1 },
      },
      modelVersion: { connect: { id: '95895489034859038490' } }
    });

    expect(result).toEqual(createdDevice);
  });

  it('should throw ConflictException when serial number already exists', async () => {
    const createDeviceDto = {
      serialNumber: 'sn-100',
      name: 'Duplicate Sensor',
      type: 'TEMP_SENSOR',
      modelVersionId: '95895489034859038490'
    };

    mockDeviceRepository.create.mockRejectedValue({
      code: 'P2002',
    });

    await expect(service.createDevice(1, createDeviceDto)).rejects.toThrow(
      ConflictException,
    );

    await expect(service.createDevice(1, createDeviceDto)).rejects.toThrow(
      'DEVICE_SERIAL_ALREADY_EXISTS',
    );
  });

  it('should throw InternalServerErrorException for unknown database error', async () => {
    const createDeviceDto = {
      serialNumber: 'sn-100',
      name: 'Sensor',
      type: 'TEMP_SENSOR',
      modelVersionId: '95895489034859038490'
    };

    mockDeviceRepository.create.mockRejectedValue({
      code: 'UNKNOWN',
    });

    await expect(service.createDevice(1, createDeviceDto)).rejects.toThrow(
      InternalServerErrorException,
    );

    await expect(service.createDevice(1, createDeviceDto)).rejects.toThrow(
      'DATABASE_CONNECTION_ERROR',
    );
  });

  it('should return only current user devices when role is not ADMIN', async () => {
    const devices = [
      {
        id: 'device-1',
        serialNumber: 'sn-100',
        userId: 10,
        type: 'TEMP_SENSOR',
      },
    ];

    mockDeviceRepository.findMany.mockResolvedValue(devices);

    const result = await service.findDevices(10, 'USER', {
      status: undefined,
      type: [],
      userIds: [],
    });
   
    expect(mockDeviceRepository.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: 10 },
      include: { modelVersion: true, user: true }
    })
  );

    expect(result).toEqual({
      data: devices,
      meta: {
        total: 1,
        filterUsed: {
          userId: 10,
        },
      },
    });
  });

  it('should allow ADMIN to filter devices by userIds and type', async () => {
    const devices = [
      {
        id: 'device-1',
        serialNumber: 'sn-100',
        userId: 10,
        type: 'TEMP_SENSOR',
      },
    ];

    mockDeviceRepository.findMany.mockResolvedValue(devices);

    const result = await service.findDevices(1, 'ADMIN', {
      userIds: ['10', '20'],
      type: ['TEMP_SENSOR'],
      status: undefined,
    });

    expect(mockDeviceRepository.findMany).toHaveBeenCalledWith({
      where: {
        userId: {
          in: [10, 20],
        },
        type: {
          in: ['TEMP_SENSOR'],
        },
      },
      include: { modelVersion: true, user: true }
    });

    expect(result.meta.total).toBe(1);
  });

  it('should apply search filter when search is provided', async () => {
    const devices = [
      {
        id: 'device-1',
        serialNumber: 'sn-100',
        name: 'Living Room Sensor',
      },
    ];

    mockDeviceRepository.findMany.mockResolvedValue(devices);

    const result = await service.findDevices(1, 'ADMIN', {
      userIds: [],
      type: [],
      status: undefined,
      search: 'living',
    });

    expect(mockDeviceRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'living', mode: 'insensitive' } },
            { serialNumber: { contains: 'living', mode: 'insensitive' } }
          ]
        },
         include: { modelVersion: true, user: true }
      })
    );

    expect(result.data).toEqual(devices);
  });

  it('should delete device if role is ADMIN', async () => {
    const device = {
      id: 'device-1',
      serialNumber: 'sn-100',
      userId: 10,
    };

    mockDeviceRepository.findOne.mockResolvedValue(device);
    mockDeviceRepository.delete.mockResolvedValue(device);

    const result = await service.deleteIfAdmin('device-1', 99, 'ADMIN');

    expect(mockDeviceRepository.findOne).toHaveBeenCalledWith({
      id: 'device-1',
    });

    expect(mockDeviceRepository.delete).toHaveBeenCalledWith({
      id: 'device-1',
    });

    expect(result).toEqual(device);
  });

  it('should throw NotFoundException when deleting non-existing device', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);

    await expect(
      service.deleteIfAdmin('missing-device', 1, 'ADMIN'),
    ).rejects.toThrow(NotFoundException);

    expect(mockDeviceRepository.delete).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenException when non-admin tries to delete device', async () => {
    const device = {
      id: 'device-1',
      serialNumber: 'sn-100',
      userId: 10,
    };

    mockDeviceRepository.findOne.mockResolvedValue(device);

    await expect(
      service.deleteIfAdmin('device-1', 10, 'USER'),
    ).rejects.toThrow(ForbiddenException);

    expect(mockDeviceRepository.delete).not.toHaveBeenCalled();
  });

  it('should toggle device status when user owns the device', async () => {
    const device = {
      id: 'device-1',
      serialNumber: 'sn-100',
      userId: 10,
      isActive: true,
    };

    const updatedDevice = {
      ...device,
      isActive: false,
    };

    mockDeviceRepository.findOne.mockResolvedValue(device);
    mockDeviceRepository.update.mockResolvedValue(updatedDevice);

    const result = await service.toggleDeviceStatus('device-1', 10);

    expect(mockDeviceRepository.findOne).toHaveBeenCalledWith({
      id: 'device-1',
    });

    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: {
        id: 'device-1',
      },
      data: {
        isActive: false,
      },
    });

    expect(result).toEqual(updatedDevice);
  });

  it('should throw ForbiddenException when user does not own the device', async () => {
    const device = {
      id: 'device-1',
      serialNumber: 'sn-100',
      userId: 10,
      isActive: true,
    };

    mockDeviceRepository.findOne.mockResolvedValue(device);

    await expect(service.toggleDeviceStatus('device-1', 99)).rejects.toThrow(
      ForbiddenException,
    );

    expect(mockDeviceRepository.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when toggling non-existing device', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);

    await expect(service.toggleDeviceStatus('device-1', 10)).rejects.toThrow(
      NotFoundException,
    );

    expect(mockDeviceRepository.update).not.toHaveBeenCalled();
  });

 it('should reassign device to a new user', async () => {
    const device = { id: 'd1', serialNumber: 'sn-100' };
    
 
    mockDeviceRepository.findOne.mockResolvedValue(device); 
    
    mockDeviceRepository.update.mockResolvedValue(device);

    await service.reassignDevice('sn-100', 2);

    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: { serialNumber: 'sn-100' },
      data: { user: { connect: { id: 2 } } }
    });
  });

 
  it('should throw NotFoundException when P2025 error occurs', async () => {
    mockDeviceRepository.create.mockRejectedValue({ code: 'P2025' });

    await expect(service.createDevice(1, { 
      serialNumber: 'sn-100', name: 'N', type: 'T', modelVersionId: '1' 
    })).rejects.toThrow(NotFoundException);
  });


  it('should allow ADMIN to filter by modelVersionIds', async () => {
    mockDeviceRepository.findMany.mockResolvedValue([]);

    await service.findDevices(1, 'ADMIN', { modelVersionIds: ['100', '200'] });

    expect(mockDeviceRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          modelVersionId: { in: [100, 200] }
        }
      })
    );
  });

  it('should get all devices', async () => {
    mockDeviceRepository.findMany.mockResolvedValue([{ id: 'd1' }]);
    const result = await service.getAllDevices();
    expect(result).toEqual([{ id: 'd1' }]);
  });

  it('should throw NotFoundException if ensureDeviceExists finds nothing', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);
    
    await expect(service.updateDevice({ where: { id: 'bad-id' }, data: {} }))
      .rejects.toThrow(NotFoundException);
  });
  it('should handle findDevices with empty filters', async () => {
  mockDeviceRepository.findMany.mockResolvedValue([]);
  
  const result = await service.findDevices(1, 'USER', {});
  
  expect(result.data).toEqual([]);
  expect(mockDeviceRepository.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { userId: 1 } })
  );
});
  it('should throw NotFoundException if device is missing during reassignDevice', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);
    
    await expect(service.reassignDevice('sn-unknown', 1))
      .rejects.toThrow(NotFoundException);
  });


  it('should throw ForbiddenException if user tries to mark device as verified without permission', async () => {

    const device = { serialNumber: 'sn-100', userId: 10 };
    mockDeviceRepository.findOne.mockResolvedValue(device);

  });

  it('should throw NotFoundException if ensureDeviceExists fails in deleteDevice', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);
    
    await expect(service.deleteDevice({ id: 'non-existent' }))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if ensureDeviceExists fails in markDeviceAsVerified', async () => {
    mockDeviceRepository.findOne.mockResolvedValue(null);
    
    await expect(service.markDeviceAsVerified('sn-100', 'CERT'))
      .rejects.toThrow(NotFoundException);
  });

  it('should properly filter by status when provided', async () => {
    mockDeviceRepository.findMany.mockResolvedValue([]);
    
    await service.findDevices(1, 'USER', { status: 'ACTIVE' });
    
    expect(mockDeviceRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' })
      })
    );
  });

  it('should ignore status filter when set to ALL', async () => {
    mockDeviceRepository.findMany.mockResolvedValue([]);
    
    await service.findDevices(1, 'USER', { status: 'ALL' });
    
    expect(mockDeviceRepository.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        where: expect.objectContaining({ status: 'ALL' })
      })
    );
  });
  it('should mark device as verified successfully when cert is processed', async () => {
    const device = { serialNumber: 'sn-100', isVerified: false };
    
  
    mockDeviceRepository.findOne.mockResolvedValue(device);

    mockDeviceRepository.update.mockResolvedValue({ ...device, isVerified: true });


    const result = await service.markDeviceAsVerified('sn-100', 'CERT123');

    
    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: { serialNumber: 'sn-100' },
      data: expect.objectContaining({
        isVerified: true,
        certSerialNumber: 'CERT123'
      })
    });
    expect(result.isVerified).toBe(true);
  });

it('should throw NotFoundException if trying to verify a non-existent device', async () => {

  mockDeviceRepository.findOne.mockResolvedValue(null);

  await expect(service.markDeviceAsVerified('ghost-sn', 'CERT'))
    .rejects.toThrow(NotFoundException);
});
describe('applyModelVersion', () => {
    const mockDevice = {
      id: 'device-123',
      serialNumber: 'sn-123',
      status: DeviceStatus.ONLINE,
      modelVersionId: 'version-1',
      modelVersion: {
        id: 'version-1',
        modelId: 'model-a',
        version: '1.0'
      }
    };

    const mockTargetVersion = {
      id: 'version-2',
      modelId: 'model-a',
      version: '2.0',
      schema: '{}',
      mapping: '{}'
    };

    beforeEach(() => {
      mockDeviceRepository.findOne.mockResolvedValue(mockDevice);
      mockDeviceRepository.findModelVersionById.mockResolvedValue(mockTargetVersion);
    });

    it('should successfully apply new model version', async () => {
      // Uspešan stage i restart
      mockMqttTransportService.sendCommandAndWaitForResponse
        .mockResolvedValueOnce({ success: true }) // Za STAGE
        .mockResolvedValueOnce({ success: true }); // Za RESTART

      const result = await service.applyModelVersion(mockDevice.id, mockTargetVersion.id);

      expect(mockMqttTransportService.sendCommandAndWaitForResponse).toHaveBeenCalledTimes(2);
      
      expect(mockMqttTransportService.sendCommandAndWaitForResponse).toHaveBeenNthCalledWith(
        1, mockDevice.serialNumber, 'STAGE_MODEL_VERSION', expect.any(Object), 15000
      );
      
      expect(mockDeviceRepository.update).toHaveBeenCalledWith({
        where: { id: mockDevice.id },
        data: { modelVersion: { connect: { id: mockTargetVersion.id } } }
      });
      
      expect(mockDashboardPlugin.invalidateDeviceCache).toHaveBeenCalledWith(mockDevice.serialNumber);

      expect(result).toEqual({
        success: true,
        staged: true,
        restartRequired: true,
        deviceId: mockDevice.id,
        serialNumber: mockDevice.serialNumber,
        model: mockTargetVersion.modelId,
        version: mockTargetVersion.version,
        modelVersionId: mockTargetVersion.id,
      });
    });

    it('should rollback database if RESTART command fails', async () => {
      // Uspešan stage, ali RESTART puca
      mockMqttTransportService.sendCommandAndWaitForResponse
        .mockResolvedValueOnce({ success: true }) // Za STAGE
        .mockResolvedValueOnce({ success: false, error: 'TIMEOUT' }); // Za RESTART

      await expect(
        service.applyModelVersion(mockDevice.id, mockTargetVersion.id)
      ).rejects.toThrow(ConflictException);

      // Trebalo bi da se pozove update 2 puta: prvi put za promenu, drugi put za rollback
      expect(mockDeviceRepository.update).toHaveBeenCalledTimes(2);
      
      expect(mockDeviceRepository.update).toHaveBeenLastCalledWith({
        where: { id: mockDevice.id },
        data: { modelVersion: { connect: { id: mockDevice.modelVersionId } } } // vraća na staru
      });

      // Invalidacija keša bi trebalo da se desi ponovo prilikom rollback-a
      expect(mockDashboardPlugin.invalidateDeviceCache).toHaveBeenCalledTimes(2);
    });
    
    it('should throw ForbiddenException if device is not ONLINE', async () => {
       const offlineDevice = { ...mockDevice, status: DeviceStatus.OFFLINE };
       mockDeviceRepository.findOne.mockResolvedValueOnce(offlineDevice);
       
       await expect(
        service.applyModelVersion(mockDevice.id, mockTargetVersion.id)
       ).rejects.toThrow(ForbiddenException);
    });
  });
});