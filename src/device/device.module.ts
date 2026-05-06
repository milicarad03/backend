import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceRepository } from './device.repository';
import { PrismaService } from '../prisma.service';

@Module({
    imports :[],
    controllers:[DeviceController],
    providers:[DeviceRepository, DeviceService, PrismaService],
    exports: [DeviceService],
})
export class DeviceModule{}