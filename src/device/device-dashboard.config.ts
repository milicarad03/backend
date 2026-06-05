import { DeviceRepository } from './device.repository';
import { DeviceTelemetryService } from './device-telemetry.service';

export type DeviceTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

export const createDeviceDashboardConfig = (
  deviceRepository: DeviceRepository,
  deviceTelemetryService: DeviceTelemetryService,
) => ({


  findDeviceById: async (deviceId: string) => {
    const device = await deviceRepository.findOne({
      serialNumber: deviceId,
    });

    if (!device) {
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
    console.log('[HOST] telemetry received from plugin', telemetry);

    await deviceTelemetryService.handleTelemetry(telemetry);

    console.log('[HOST] telemetry saved:', telemetry.deviceId);
  },
});