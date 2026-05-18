import { Module } from '@nestjs/common';
import { DeviceRepository } from './device.repository';
import { PrismaService } from '../prisma.service';
import { DeviceTelemetryService } from './device-telemetry.service';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';

@Module({
  providers: [DeviceRepository,PrismaService, DeviceTelemetryService, DeviceTelemetryGateway],
  exports: [DeviceRepository, PrismaService, DeviceTelemetryService, DeviceTelemetryGateway],
})
export class DeviceDataModule {}