import { Module } from '@nestjs/common';
import { DeviceRepository } from './device.repository';
import { PrismaService } from '../prisma.service';
import { DeviceTelemetryService } from './device-telemetry.service';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';
import { MqttTransportService } from 'src/mqtt/mqtt-transport.service';
import { DevicePresenceService } from './device-presence.service';

@Module({
  providers: [
    DeviceRepository,
    PrismaService,
    DeviceTelemetryService,
    DeviceTelemetryGateway,
    DevicePresenceService,
  ],
  exports: [DeviceRepository, PrismaService, DeviceTelemetryService, DeviceTelemetryGateway],
})
export class DeviceDataModule {}
