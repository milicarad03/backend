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
//brokerUrl: 'mqtt://localhost:1883',

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
    };
  },

  onTelemetry: async (telemetry: DeviceTelemetry) => {
    console.log('[HOST] telemetry received from plugin', telemetry);

    await deviceTelemetryService.handleTelemetry(telemetry);

    console.log('[HOST] telemetry saved:', telemetry.deviceId);
  },
});