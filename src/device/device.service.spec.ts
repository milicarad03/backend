import { Test, TestingModule } from '@nestjs/testing';
import {ConflictException,ForbiddenException,InternalServerErrorException,NotFoundException} from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceRepository } from './device.repository';
import { DeviceDashboardService } from 'serverplugin';

describe('DeviceService', () => {
  let service: DeviceService;

  const mockDeviceRepository = {
    findOne: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createTelemetry: jest.fn(),
  };

  const mockDashboardPlugin = {
    checkDevice: jest.fn(),
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
    mockDeviceRepository.update.mockResolvedValue(device);

    await service.reassignDevice('sn-100', 2);

    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: { serialNumber: 'sn-100' },
      data: { user: { connect: { id: 2 } } }
    });
  });

  it('should mark device as verified', async () => {
    const device = { serialNumber: 'sn-100', isVerified: true };
    mockDeviceRepository.update.mockResolvedValue(device);

    await service.markDeviceAsVerified('sn-100', 'CERT123');

    expect(mockDeviceRepository.update).toHaveBeenCalledWith({
      where: { serialNumber: 'sn-100' },
      data: expect.objectContaining({
        isVerified: true,
        certSerialNumber: 'CERT123'
      })
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

});