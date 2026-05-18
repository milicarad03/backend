import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceRepository } from './device.repository';
import { DeviceDataModule } from './device-data.module';
import { DeviceDashboardModule } from 'serverplugin';
import { DeviceTelemetryService } from './device-telemetry.service';
export type DeviceTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;

};

@Module({
  imports: [
    DeviceDataModule,

    DeviceDashboardModule.registerAsync({
      imports: [DeviceDataModule],
      useFactory: (deviceRepository: DeviceRepository, deviceService:DeviceTelemetryService) => ({
        brokerUrl: 'mqtt://localhost:1883',

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
        onTelemetry: async (telemetry) => {
            console.log('[HOST] telemetry received from plugin', telemetry);
            await deviceService.handleTelemetry(telemetry);

            console.log('[HOST] telemetry saved:', telemetry.deviceId);
          },
      }),
      inject: [DeviceRepository, DeviceTelemetryService],
    }),
  ],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}