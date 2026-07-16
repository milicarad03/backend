import { Test, TestingModule } from '@nestjs/testing';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { DeviceTelemetryService } from './device-telemetry.service';
import { NotFoundException,ForbiddenException } from '@nestjs/common';
import { MqttTransportService } from '../mqtt/mqtt-transport.service';
import { DeviceDashboardService } from 'serverplugin';

describe('DeviceController', () => {
  let controller: DeviceController;

  const mockDeviceService = {
    findDevices: jest.fn(),
    createDevice: jest.fn(),
    getAllDevices: jest.fn(),
    findAllByUser: jest.fn(),
    getDevice: jest.fn(),
    deleteIfAdmin: jest.fn(),
    toggleDeviceStatus: jest.fn(),
    testPluginDeviceCheck: jest.fn(),
    reassignDevice:jest.fn(),
  };

  const mockDeviceTelemetryService = {
    getTelemetryHistory: jest.fn(),
    getLatestTelemetry: jest.fn(),
  };
  const mockMqttTransportService = {
  publish: jest.fn(),
};

const mockDeviceDashboardService = {
  executeCommand: jest.fn(),
  getCommandMetadata: jest.fn(),
};


  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [
        {
          provide: DeviceService,
          useValue: mockDeviceService,
        },
        {
          provide: DeviceTelemetryService,
          useValue: mockDeviceTelemetryService,
        },
        {
          provide: MqttTransportService,
          useValue: mockMqttTransportService,
        },
        {
          provide: DeviceDashboardService,
          useValue: mockDeviceDashboardService,
        },
      ]
    }).compile();

    controller = module.get<DeviceController>(DeviceController);
  });

  it('should get devices with normalized filters', async () => {
    const req = {
      user: {
        userId: 1,
        role: 'USER',
      },
    };

    const serviceResult = {
      data: [],
      meta: {
        total: 0,
      },
    };

    mockDeviceService.findDevices.mockResolvedValue(serviceResult);

    const result = await controller.getDevice(
      req,
      'ACTIVE',
      'TEMP_SENSOR' as any,
      '2',
    );

    expect(mockDeviceService.findDevices).toHaveBeenCalledWith(1, 'USER', {
      status: 'ACTIVE',
      type: ['TEMP_SENSOR'],
      userIds: ['2'],
    });

    expect(result).toEqual(serviceResult);
  });

  it('should register device', async () => {
    const req = {
      user: {
        id: 1,
      },
    };

    const dto = {
      serialNumber: 'sn-100',
      name: 'Temperature Sensor',
      type: 'TEMP_SENSOR',
      modelVersionId: '1',
    };

    const createdDevice = {
      id: 'device-1',
      ...dto,
      userId: 1,
    };

    mockDeviceService.createDevice.mockResolvedValue(createdDevice);

    const result = await controller.registerDevice(req, dto);

    expect(mockDeviceService.createDevice).toHaveBeenCalledWith(1, dto);
    expect(result).toEqual(createdDevice);
  });

  it('should get my devices', async () => {
    const req = {
      user: {
        userId: 1,
      },
    };

    const devices = [
      {
        id: 'device-1',
        serialNumber: 'sn-100',
        userId: 1,
      },
    ];

    mockDeviceService.findAllByUser.mockResolvedValue(devices);

    const result = await controller.getMyDevices(req);

    expect(mockDeviceService.findAllByUser).toHaveBeenCalledWith(1);
    expect(result).toEqual(devices);
  });

  it('should get device by id', async () => {
    const device = {
      id: 'device-1',
      serialNumber: 'sn-100',
    };

    mockDeviceService.getDevice.mockResolvedValue(device);

    const result = await controller.getDeviceById('device-1');

    expect(mockDeviceService.getDevice).toHaveBeenCalledWith({
      id: 'device-1',
    });

    expect(result).toEqual(device);
  });

  it('should delete device', async () => {
    const req = {
      user: {
        userId: 1,
        role: 'ADMIN',
      },
    };

    const deletedDevice = {
      id: 'device-1',
      serialNumber: 'sn-100',
    };

    mockDeviceService.deleteIfAdmin.mockResolvedValue(deletedDevice);

    const result = await controller.deleteDevice('device-1', req);

    expect(mockDeviceService.deleteIfAdmin).toHaveBeenCalledWith(
      'device-1',
      1,
      'ADMIN',
    );

    expect(result).toEqual(deletedDevice);
  });

  it('should toggle device', async () => {
    const req = {
      user: {
        userId: 1,
      },
    };

    const toggledDevice = {
      id: 'device-1',
      serialNumber: 'sn-100',
      isActive: false,
    };

    mockDeviceService.toggleDeviceStatus.mockResolvedValue(toggledDevice);

    const result = await controller.toggleDevice('device-1', req);

    expect(mockDeviceService.toggleDeviceStatus).toHaveBeenCalledWith(
      'device-1',
      1,
    );

    expect(result).toEqual(toggledDevice);
  });

  it('should get telemetry history for device', async () => {
    const history = [
      {
        id: 'telemetry-1',
        deviceId: 'sn-100',
        data: {
          temperature: 22.5,
        },
      },
    ];

    mockDeviceTelemetryService.getTelemetryHistory.mockResolvedValue(history);

    const result = await controller.getDeviceTelemetry('sn-100');

    expect(mockDeviceTelemetryService.getTelemetryHistory).toHaveBeenCalledWith(
      'sn-100',
    );

    expect(result).toEqual(history);
  });

  it('should get latest telemetry for device', async () => {
    const latest = {
      id: 'telemetry-1',
      deviceId: 'sn-100',
      data: {
        temperature: 22.5,
      },
    };

    mockDeviceTelemetryService.getLatestTelemetry.mockResolvedValue(latest);

    const result = await controller.getLatestDeviceTelemetry('sn-100');

    expect(mockDeviceTelemetryService.getLatestTelemetry).toHaveBeenCalledWith(
      'sn-100',
    );

    expect(result).toEqual(latest);
  });

  it('should call plugin check', async () => {
    const pluginResult = {
      exists: true,
      deviceId: 'sn-100',
    };

    mockDeviceService.testPluginDeviceCheck.mockResolvedValue(pluginResult);

    const result = await controller.pluginCheck('sn-100');

    expect(mockDeviceService.testPluginDeviceCheck).toHaveBeenCalledWith(
      'sn-100',
    );

    expect(result).toEqual(pluginResult);
  });
  it('should throw NotFoundException when device does not exist', async () => {
    mockDeviceService.getDevice.mockRejectedValue(new NotFoundException());

    await expect(controller.getDeviceById('bad-id')).rejects.toThrow(NotFoundException);
  });

  it('should handle empty query params in getDevice', async () => {
    const req = { user: { userId: 1, role: 'USER' } };
    mockDeviceService.findDevices.mockResolvedValue([]);

    await controller.getDevice(req, undefined, undefined, undefined);

    expect(mockDeviceService.findDevices).toHaveBeenCalledWith(1, 'USER', {
      status: undefined,
      type: [],
      userIds: [],
    });
  });
  it('should reassign device', async () => {
    const req = { user: { userId: 1 } };
    const reassignmentResult = { id: 'device-1', userId: 2 };
    mockDeviceService.reassignDevice.mockResolvedValue(reassignmentResult);

    const result = await controller.reassignDevice('device-1', 2, req);

    expect(mockDeviceService.reassignDevice).toHaveBeenCalledWith('device-1', 2);
    expect(result).toEqual(reassignmentResult);
  });

  it('should throw ForbiddenException if user lacks permission to delete', async () => {
    const req = { user: { userId: 1, role: 'USER' } }; 
    mockDeviceService.deleteIfAdmin.mockRejectedValue(new ForbiddenException());

    await expect(controller.deleteDevice('device-1', req)).rejects.toThrow(ForbiddenException);
  });
  it('should normalize multiple userIds and types', async () => {
    const req = { user: { userId: 1, role: 'ADMIN' } };
    mockDeviceService.findDevices.mockResolvedValue([]);

    await controller.getDevice(req, 'ONLINE', ['SENS', 'ACTUATOR'], ['2', '3']);

    expect(mockDeviceService.findDevices).toHaveBeenCalledWith(1, 'ADMIN', {
      status: 'ONLINE',
      type: ['SENS', 'ACTUATOR'],
      userIds: ['2', '3'],
    });
  });

  it('should propagate generic errors as Internal Server Error', async () => {
 
    mockDeviceService.getDevice.mockRejectedValue(new Error('Unexpected Database Crash'));

  
    await expect(controller.getDeviceById('any-id')).rejects.toThrow('Unexpected Database Crash');
  });
  it('should propagate NotFoundException when toggling non-existent device', async () => {
    const req = { user: { userId: 1 } };
    mockDeviceService.toggleDeviceStatus.mockRejectedValue(new NotFoundException());

    await expect(controller.toggleDevice('bad-id', req)).rejects.toThrow(NotFoundException);
  });

  it('should execute device command', async () => {
    mockDeviceDashboardService.executeCommand.mockResolvedValue(
      undefined,
    );

    const result = await controller.sendDeviceCommand(
      'sn-100',
      {
        command: 'SET_LED',
        payload: { value: true },
      },
    );

    expect(
      mockDeviceDashboardService.executeCommand,
    ).toHaveBeenCalledWith(
      'sn-100',
      'SET_LED',
      { value: true },
    );

    expect(result).toEqual({
      success: true,
    });
  });
  it('should return command metadata', async () => {
    const metadata = [
      {
        command: 'SET_LED',
      },
    ];

    mockDeviceDashboardService.getCommandMetadata.mockResolvedValue(
      metadata,
    );

    const result =
      await controller.getCommandMetadata('sn-100');

    expect(
      mockDeviceDashboardService.getCommandMetadata,
    ).toHaveBeenCalledWith('sn-100');

    expect(result).toEqual(metadata);
  });
});