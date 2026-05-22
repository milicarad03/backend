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
    });

    expect(result).toEqual(createdDevice);
  });

  it('should create device for current user when targetUserId is not provided', async () => {
    const createDeviceDto = {
      serialNumber: 'sn-101',
      name: 'Humidity Sensor',
      type: 'HUMIDITY_SENSOR',
    };

    const createdDevice = {
      id: 'device-2',
      serialNumber: 'sn-101',
      name: 'Humidity Sensor',
      type: 'HUMIDITY_SENSOR',
      userId: 1,
      isActive: true,
      createdAt: new Date(),
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
    });

    expect(result).toEqual(createdDevice);
  });

  it('should throw ConflictException when serial number already exists', async () => {
    const createDeviceDto = {
      serialNumber: 'sn-100',
      name: 'Duplicate Sensor',
      type: 'TEMP_SENSOR',
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

    expect(mockDeviceRepository.findMany).toHaveBeenCalledWith({
      where: {
        userId: 10,
      },
    });

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

    expect(mockDeviceRepository.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'living', mode: 'insensitive' } },
          { serialNumber: { contains: 'living', mode: 'insensitive' } },
        ],
      },
    });

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

});