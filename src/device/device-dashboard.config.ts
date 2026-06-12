import { DeviceRepository } from './device.repository';
import { DeviceTelemetryService } from './device-telemetry.service';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
export type DeviceTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

const logger = new Logger('DeviceDashboardConfig');
const redisClient = new Redis({
  host: 'localhost',
  port: 6379,
});

redisClient.on('connect', () => logger.log('Successfully connected to Redis Server.'));
redisClient.on('error', (err) => logger.error(`Redis connection error: ${err.message}`));

export const createDeviceDashboardConfig = (
  deviceRepository: DeviceRepository,
  deviceTelemetryService: DeviceTelemetryService,
) => ({
  redis: redisClient,


  findDeviceById: async (deviceId: string) => {
    const device = await deviceRepository.findOne({
      serialNumber: deviceId,
    });

    if (!device) {
      logger.warn(`Device lookup failed during plugin configuration for serial: ${deviceId}`);
      return null;
    }

    return {
      id: device.id,
      serialNumber: device.serialNumber,
      name: device.name,
      type: device.type,

      model: device.modelVersion?.modelId,
      version: device.modelVersion?.version,
      schema: device.modelVersion?.schema,
      mapping: device.modelVersion?.mapping,

    };
  },

  onTelemetry: async (telemetry: DeviceTelemetry) => {
    logger.debug(`Forwarding telemetry from plugin to telemetry service for device: ${telemetry.deviceId}`);
    await deviceTelemetryService.handleTelemetry(telemetry);
  },
});