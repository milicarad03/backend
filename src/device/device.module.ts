import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceRepository } from './device.repository';
import { DeviceDataModule } from './device-data.module';
import { DeviceDashboardModule } from 'serverplugin';
import { DeviceTelemetryService } from './device-telemetry.service';
import { createDeviceDashboardConfig } from './device-dashboard.config';
import { RedisModule } from './redis.module';
import Redis from 'ioredis';
import { MqttModule } from 'src/mqtt/mqtt.module';
import { MqttPublisherService } from '../mqtt/mqtt-publisher.service';
import { MqttTransportService } from 'src/mqtt/mqtt-transport.service';

export type DeviceTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;

};

@Module({
  imports: [
    DeviceDataModule,
    RedisModule,
    MqttModule,
    DeviceDashboardModule.registerAsync({
      imports: [DeviceDataModule, RedisModule, MqttModule],
      useFactory: (repo, telService, redis,  mqttPublisher) => createDeviceDashboardConfig(repo, telService, redis,mqttPublisher),
      inject: [DeviceRepository, DeviceTelemetryService, 'REDIS_CLIENT',MqttPublisherService],
    }),
  ],
  controllers: [DeviceController],
  providers: [DeviceService, MqttTransportService],
  exports: [DeviceService],
})
export class DeviceModule {}