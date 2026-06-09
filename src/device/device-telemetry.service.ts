import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { DeviceRepository } from './device.repository';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';

export type IncomingTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

@Injectable()
export class DeviceTelemetryService {
  private readonly logger = new Logger(DeviceTelemetryService.name);
  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly telemetryGateway: DeviceTelemetryGateway,
  ) {}

  async handleTelemetry(telemetry: IncomingTelemetry) {
   this.logger.debug(`Telemetry received from plugin for device: ${telemetry.deviceId}`);

    const timestamp = new Date(telemetry.timestamp);
    

    const device = await this.deviceRepository.findOne({
        serialNumber: telemetry.deviceId,
      });

      if (!device) {
       this.logger.error(`Failed to handle telemetry. Device not found: ${telemetry.deviceId}`);
       throw new NotFoundException(`Device not found: ${telemetry.deviceId}`);
    }

    const savedTelemetry = await this.deviceRepository.createTelemetry({
        deviceId: telemetry.deviceId,
        timestamp,
        data: telemetry.data as Prisma.InputJsonValue,
        modelVersionId: device.modelVersionId ?? undefined
     });

    this.logger.debug(`Cleaning up old telemetry records for device: ${telemetry.deviceId}`);

    await this.deviceRepository.deleteOldTelemetryForDevice(
      telemetry.deviceId,
      5,
    );

    await this.deviceRepository.update({
      where: {
        serialNumber: telemetry.deviceId,
      },
      data: {
        lastseen: timestamp,
      },
    });


    this.telemetryGateway.emitTelemetryUpdate({
        deviceId: telemetry.deviceId,
        timestamp: savedTelemetry.timestamp,
        data: savedTelemetry.data as Record<string, unknown>,
    });

  this.logger.log(`Telemetry processed, saved and emitted for device: ${telemetry.deviceId}`);

  return savedTelemetry;
  }

  async getTelemetryHistory(deviceId: string) {
    this.logger.log(`Fetching telemetry history for device: ${deviceId}`);
    return this.deviceRepository.findTelemetryByDeviceId(deviceId);
  }

  async getLatestTelemetry(deviceId: string) {
    this.logger.log(`Fetching latest telemetry record for device: ${deviceId}`);
    return this.deviceRepository.findLatestTelemetryByDeviceId(deviceId);
  }

 
}