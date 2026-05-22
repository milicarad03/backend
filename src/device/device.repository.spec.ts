import { Test, TestingModule } from '@nestjs/testing';
import { DeviceRepository } from './device.repository';
import { PrismaService } from '../prisma.service';

describe('DeviceRepository', () => {
  let repository: DeviceRepository;

  const mockPrismaService = {
    device: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    deviceTelemetry: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<DeviceRepository>(DeviceRepository);
  });

  it('should find one device by unique field and include user', async () => {
    const device = {
      id: 'device-1',
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
      userId: 1,
      user: {
        id: 1,
        email: 'test@example.com',
      },
    };

    mockPrismaService.device.findUnique.mockResolvedValue(device);

    const result = await repository.findOne({ id: 'device-1' });

    expect(mockPrismaService.device.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'device-1',
      },
      include: {
        user: true,
      },
    });

    expect(result).toEqual(device);
  });

  it('should find many devices with default user include', async () => {
    const devices = [
      {
        id: 'device-1',
        serialNumber: 'sn-100',
        name: 'Temperature Sensor',
        type: 'TEMP_SENSOR',
        userId: 1,
      },
    ];

    mockPrismaService.device.findMany.mockResolvedValue(devices);

    const result = await repository.findMany({
      where: {
        userId: 1,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(mockPrismaService.device.findMany).toHaveBeenCalledWith({
      skip: undefined,
      take: undefined,
      cursor: undefined,
      where: {
        userId: 1,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: true,
      },
    });

    expect(result).toEqual(devices);
  });

  it('should find many devices with custom include', async () => {
    const devices = [
      {
        id: 'device-1',
        serialNumber: 'sn-100',
      },
    ];

    mockPrismaService.device.findMany.mockResolvedValue(devices);

    const result = await repository.findMany({
      where: {
        type: 'TEMP_SENSOR',
      },
      include: {
        user: false,
      } as any,
    });

    expect(mockPrismaService.device.findMany).toHaveBeenCalledWith({
      skip: undefined,
      take: undefined,
      cursor: undefined,
      where: {
        type: 'TEMP_SENSOR',
      },
      orderBy: undefined,
      include: {
        user: false,
      },
    });

    expect(result).toEqual(devices);
  });

  it('should create device', async () => {
    const createData = {
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
      user: {
        connect: {
          id: 1,
        },
      },
    };

    const createdDevice = {
      id: 'device-1',
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
      userId: 1,
      isActive: true,
      createdAt: new Date(),
    };

    mockPrismaService.device.create.mockResolvedValue(createdDevice);

    const result = await repository.create(createData);

    expect(mockPrismaService.device.create).toHaveBeenCalledWith({
      data: createData,
    });

    expect(result).toEqual(createdDevice);
  });

  it('should update device', async () => {
    const updatedDevice = {
      id: 'device-1',
      serialNumber: 'sn-100',
      isActive: false,
    };

    const params = {
      where: {
        id: 'device-1',
      },
      data: {
        isActive: false,
      },
    };

    mockPrismaService.device.update.mockResolvedValue(updatedDevice);

    const result = await repository.update(params);

    expect(mockPrismaService.device.update).toHaveBeenCalledWith(params);
    expect(result).toEqual(updatedDevice);
  });

  it('should delete device', async () => {
    const deletedDevice = {
      id: 'device-1',
      serialNumber: 'sn-100',
    };

    mockPrismaService.device.delete.mockResolvedValue(deletedDevice);

    const result = await repository.delete({ id: 'device-1' });

    expect(mockPrismaService.device.delete).toHaveBeenCalledWith({
      where: {
        id: 'device-1',
      },
    });

    expect(result).toEqual(deletedDevice);
  });

  it('should create telemetry', async () => {
    const telemetryParams = {
      deviceId: 'sn-100',
      timestamp: new Date('2026-05-18T08:54:08.179Z'),
      data: {
        temperature: 22.5,
        humidity: 45,
        pressure: 1012,
        led: false,
      },
    };

    const createdTelemetry = {
      id: 'telemetry-1',
      ...telemetryParams,
      createdAt: new Date(),
    };

    mockPrismaService.deviceTelemetry.create.mockResolvedValue(createdTelemetry);

    const result = await repository.createTelemetry(telemetryParams);

    expect(mockPrismaService.deviceTelemetry.create).toHaveBeenCalledWith({
      data: {
        deviceId: 'sn-100',
        timestamp: telemetryParams.timestamp,
        data: telemetryParams.data,
      },
    });

    expect(result).toEqual(createdTelemetry);
  });

  it('should find telemetry history by deviceId', async () => {
    const history = [
      {
        id: 'telemetry-1',
        deviceId: 'sn-100',
        timestamp: new Date(),
        data: {
          temperature: 22.5,
        },
      },
    ];

    mockPrismaService.deviceTelemetry.findMany.mockResolvedValue(history);

    const result = await repository.findTelemetryByDeviceId('sn-100');

    expect(mockPrismaService.deviceTelemetry.findMany).toHaveBeenCalledWith({
      where: {
        deviceId: 'sn-100',
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 20,
    });

    expect(result).toEqual(history);
  });

  it('should find latest telemetry by deviceId', async () => {
    const latest = {
      id: 'telemetry-1',
      deviceId: 'sn-100',
      timestamp: new Date(),
      data: {
        temperature: 22.5,
      },
    };

    mockPrismaService.deviceTelemetry.findFirst.mockResolvedValue(latest);

    const result = await repository.findLatestTelemetryByDeviceId('sn-100');

    expect(mockPrismaService.deviceTelemetry.findFirst).toHaveBeenCalledWith({
      where: {
        deviceId: 'sn-100',
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    expect(result).toEqual(latest);
  });
});