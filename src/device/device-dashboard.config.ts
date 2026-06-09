import { DeviceRepository } from './device.repository';
import { DeviceTelemetryService } from './device-telemetry.service';
import { Logger } from '@nestjs/common';
export type DeviceTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};
const logger = new Logger('DeviceDashboardConfig');

export const createDeviceDashboardConfig = (
  deviceRepository: DeviceRepository,
  deviceTelemetryService: DeviceTelemetryService,
) => ({


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