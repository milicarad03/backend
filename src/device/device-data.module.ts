import { Module } from '@nestjs/common';
import { DeviceRepository } from './device.repository';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [DeviceRepository, PrismaService],
  exports: [DeviceRepository, PrismaService],
})
export class DeviceDataModule {}