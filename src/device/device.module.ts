import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceRepository } from './device.repository';
import { DeviceDataModule } from './device-data.module';
import { DeviceDashboardModule } from 'serverplugin';
import { DeviceTelemetryService } from './device-telemetry.service';
import { createDeviceDashboardConfig } from './device-dashboard.config';
import { MqttTransportService } from '../mqtt/mqtt-transport.service';
import { RedisModule } from './redis.module';
import Redis from 'ioredis';
export type DeviceTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;

};

@Module({
  imports: [
    DeviceDataModule,
    RedisModule,
    DeviceDashboardModule.registerAsync({
      imports: [DeviceDataModule, RedisModule],
      useFactory: (repo, telService, redis) => createDeviceDashboardConfig(repo, telService, redis),
      inject: [DeviceRepository, DeviceTelemetryService, 'REDIS_CLIENT'],
    }),
  ],
  controllers: [DeviceController],
  providers: [
    DeviceService, MqttTransportService],
  exports: [DeviceService],
})
export class DeviceModule {}