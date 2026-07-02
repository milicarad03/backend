import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { DeviceRepository } from './device.repository';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';
import { DeviceStatus } from '../generated/prisma/client.js';
import _ from 'lodash';

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
  //dodat try/catch

  async handleStatusChange(deviceId: string, status: string) {
    this.logger.log(`[SERVICE] Handling status change for ${deviceId} -> ${status}`);

    try {
      const device = await this.deviceRepository.findOne({ serialNumber: deviceId });
      if (!device) {
        this.logger.warn(`[SERVICE] Skipping status update. Device ${deviceId} does not exist in DB.`);
        return;
      }
    await this.deviceRepository.update({
      where: { serialNumber: deviceId },
      data: {
        status: status as DeviceStatus,
        lastseen: new Date(), 
      },
    });
    this.telemetryGateway.emitStatusUpdate(deviceId, status);

    this.logger.debug(`[SERVICE] Status successfully persisted in DB for: ${deviceId}`);
    } catch (err: any) {
      this.logger.error(`[SERVICE] Failed to persist status change for ${deviceId}: ${err.message}`, err.stack);
      throw err;
    }

  }

  async handleTelemetry(telemetry: IncomingTelemetry) {
   this.logger.debug(`Telemetry received from plugin for device: ${telemetry.deviceId}`);

    const timestamp = new Date(telemetry.timestamp);
    if (isNaN(timestamp.getTime())) {
      this.logger.error(`Invalid timestamp received: ${telemetry.timestamp}`);
      throw new Error('INVALID_TIMESTAMP'); 
    }
    

    const device = await this.deviceRepository.findOne({ serialNumber: telemetry.deviceId});
    
      if (!device) {
       this.logger.error(`Failed to handle telemetry. Device not found: ${telemetry.deviceId}`);
       throw new NotFoundException(`Device not found: ${telemetry.deviceId}`);
    }
    if (!device.isVerified) {
      this.logger.warn(`[SECURITY] Telemetry rejected: Device ${telemetry.deviceId} is not verified. Access denied.`);
      throw new ForbiddenException(`Device ${telemetry.deviceId} is not verified. Please register your certificate.`);
    }
    const last = await this.deviceRepository.findLatestTelemetryByDeviceId(telemetry.deviceId);
    const mergedData = _.merge({}, last?.data ?? {}, telemetry.data);

    const savedTelemetry = await this.deviceRepository.createTelemetry({
        deviceId: telemetry.deviceId,
        timestamp,
        data: mergedData as Prisma.InputJsonValue,
        modelVersionId: device.modelVersionId ?? undefined
     });
    this.logger.log(`[DATABASE SAVE] Saved telemetry structure: ${JSON.stringify(savedTelemetry.data, null, 2)}`);

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
        status: 'ONLINE',
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