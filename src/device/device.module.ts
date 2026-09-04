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
import { MqttTransportService } from 'src/mqtt/mqtt-transport.service';
import { DeviceCommandAuditService } from './device-command-audit.service';
import { CoapModule } from 'src/coap/coap.module';
import { CoapTransportService } from 'src/coap/coap-transport.service';
import { DeviceCommandService } from './device-command.service';
import { DeviceBulkImportService } from './device-bulk-import.service';

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
    CoapModule,
    DeviceDashboardModule.registerAsync({
      imports: [DeviceDataModule, RedisModule, CoapModule],
      useFactory: (repo, telService, redis, commandService) =>
        createDeviceDashboardConfig(
          repo,
          telService,
          redis,
          commandService,
        ),
      inject: [
        DeviceRepository,
        DeviceTelemetryService,
        'REDIS_CLIENT',
        DeviceCommandService,
      ],
    }),
  ],
  controllers: [DeviceController],
  providers: [
    DeviceBulkImportService,
    DeviceService,
    MqttTransportService,
    CoapTransportService,
    DeviceCommandAuditService,
  ],
  exports: [DeviceService],
})
export class DeviceModule {}
