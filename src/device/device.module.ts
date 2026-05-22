import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceRepository } from './device.repository';
import { DeviceDataModule } from './device-data.module';
import { DeviceDashboardModule } from 'serverplugin';
import { DeviceTelemetryService } from './device-telemetry.service';
import { createDeviceDashboardConfig } from './device-dashboard.config';
import { MqttTransportService } from '../mqtt/mqtt-transport.service';
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
      useFactory: createDeviceDashboardConfig,
      inject: [DeviceRepository, DeviceTelemetryService],
    }),
  ],
  controllers: [DeviceController],
  providers: [DeviceService, MqttTransportService],
  exports: [DeviceService],
})
export class DeviceModule {}