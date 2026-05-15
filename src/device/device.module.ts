import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceRepository } from './device.repository';
import { DeviceDataModule } from './device-data.module';

import { DeviceDashboardModule } from 'serverplugin';

@Module({
  imports: [
    DeviceDataModule,

    DeviceDashboardModule.registerAsync({
      imports: [DeviceDataModule],
      useFactory: (deviceRepository: DeviceRepository) => ({
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
      }),
      inject: [DeviceRepository],
    }),
  ],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}