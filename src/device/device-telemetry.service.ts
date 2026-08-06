import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { DeviceRepository } from './device.repository';
import { DeviceTelemetryGateway } from './device-telemetry.gateway';
import { DeviceStatus } from '../generated/prisma/client.js';
import { EventEmitter } from 'events';
import _ from 'lodash';
import { InvalidTimestampException } from 'serverplugin';

export type IncomingTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

@Injectable()
export class DeviceTelemetryService {
  private readonly logger = new Logger(DeviceTelemetryService.name);
  private readonly statusEmitter = new EventEmitter();
  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly telemetryGateway: DeviceTelemetryGateway,
  ) {}
  //OVO KONTROLER POZIVA KAD CEKA ODGOVOR NA PUBLISH START TELEMETRY
  async waitForDeviceStatus(deviceId: string, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.statusEmitter.removeAllListeners(`status:${deviceId}`);
        resolve(false); // Vraća false ako istekne vreme
      }, timeout);

      this.statusEmitter.once(`status:${deviceId}`, (status) => {
        clearTimeout(timer);
        resolve(status === 'ONLINE');
      });
    });
  }
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
    this.statusEmitter.emit(`status:${deviceId}`, status);

    this.logger.debug(`[SERVICE] Status successfully persisted in DB for: ${deviceId}`);
    } catch (err: any) {
      this.logger.error(`[SERVICE] Failed to persist status change for ${deviceId}: ${err.message}`, err.stack);
      throw err;
    }

  }

  async handleTelemetry(telemetry: IncomingTelemetry) {
    //await this.deviceRepository.deleteTelemetryByDeviceId("sn-100");
  this.logger.error(`[RAW PAYLOAD] ${JSON.stringify(telemetry.data, null, 2)}`);
   this.logger.debug(`Telemetry received from plugin for device: ${telemetry.deviceId}`);

    const timestamp = new Date(telemetry.timestamp);
   /* if (isNaN(timestamp.getTime())) {
      this.logger.error(`Invalid timestamp received: ${telemetry.timestamp}`);
      throw new Error('INVALID_TIMESTAMP'); 
    }*/
   if (isNaN(timestamp.getTime())) {
      this.logger.error(`Invalid timestamp received: ${telemetry.timestamp}`);

      throw new InvalidTimestampException();
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

     // const historicalTelemetry = telemetry.data.historicalTelemetry || [];
     // const currentData = _.omit(telemetry.data, 'historicalTelemetry');



    const last = await this.deviceRepository.findLatestTelemetryByDeviceId(telemetry.deviceId);
    //const lastData = _.omit( (last?.data as any) ?? {},  "historicalTelemetry");
    const historicalTelemetry = telemetry.data.historicalTelemetry;
  //  const lastData = (last?.data as Record<string, any>) ?? {};
    const lastData = _.omit( (last?.data as Record<string, any>) ?? {},"historicalTelemetry");

      const mergedData: Record<string, any> = {
        ...lastData
      };
      const currentData = _.omit(telemetry.data, "historicalTelemetry");

    const mergedCurrent = _.merge(
      {},
      lastData,
      currentData
    );
    const history =
      telemetry.data.historicalTelemetry as Record<string, any>;

    if (history) {

    Object.entries(history).forEach(([field, values]) => {

      if (!Array.isArray(mergedData[field])) {
        mergedData[field] = [];
      }

      mergedData[field].push(...(values as any[]));
    });
    }
    Object.entries(telemetry.data).forEach(
      ([field, value]) => {

        if (field === "historicalTelemetry") {
          return;
        }

        mergedData[field] ??= [];
        if (!Array.isArray(mergedData[field])) {
          mergedData[field] = [];
        }

        mergedData[field].push([
          value,
          telemetry.timestamp
        ]);
      
      }
    );
     Object.keys(mergedData).forEach(field => {

      if (!Array.isArray(mergedData[field])) {
        return;
      }

      const unique = new Map();

      mergedData[field].forEach((point: any) => {
        unique.set(point[1], point);
      });

      mergedData[field] = [...unique.values()]
        .sort(
          (a: any, b: any) =>
            new Date(a[1]).getTime() -
            new Date(b[1]).getTime()
        )
        .slice(-500);

  });

  /*  const mergedData = {
      ...mergedCurrent,
      historicalTelemetry
    };*/
    //const mergedData = _.merge({}, last?.data ?? {}, telemetry.data);
    // Merge samo TRENUTNE podatke
    this.logger.error(`[MERGED DATA] ${JSON.stringify(mergedData, null, 2)}`);


    const savedTelemetry = await this.deviceRepository.createTelemetry({
        deviceId: telemetry.deviceId,
        timestamp,
        data: mergedData as Prisma.InputJsonValue,
        modelVersionId: device.modelVersionId ?? undefined
     });
    this.logger.log(`[DATABASE SAVE] Saved telemetry structure: ${JSON.stringify(savedTelemetry, null, 2)}`);

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
       // telemetryState: 'ACTIVE',
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