import { Injectable } from '@nestjs/common';
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
  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly telemetryGateway: DeviceTelemetryGateway,
  ) {}

  async handleTelemetry(telemetry: IncomingTelemetry) {
    console.log('[HOST] Telemetry received from plugin:', telemetry);

    const timestamp = new Date(telemetry.timestamp);

    const savedTelemetry = await this.deviceRepository.createTelemetry({
      deviceId: telemetry.deviceId,
      timestamp,
      data: telemetry.data as Prisma.InputJsonValue,
    });

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

    console.log('[HOST] Telemetry saved and emitted:', telemetry.deviceId);

    return savedTelemetry;
  }

  async getTelemetryHistory(deviceId: string) {
    return this.deviceRepository.findTelemetryByDeviceId(deviceId);
  }

  async getLatestTelemetry(deviceId: string) {
    return this.deviceRepository.findLatestTelemetryByDeviceId(deviceId);
  }
}