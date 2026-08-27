import { DeviceRepository } from './device.repository';
import { DeviceTelemetryService } from './device-telemetry.service';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { MqttPublisherService } from 'src/mqtt/mqtt-publisher.service';
import type {
  CommandDispatchContext,
  DeviceAttributes,
} from 'serverplugin';

export type DeviceTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

const logger = new Logger('DeviceDashboardConfig');

export const createDeviceDashboardConfig = (
  deviceRepository: DeviceRepository,
  deviceTelemetryService: DeviceTelemetryService,
  redisClient: Redis,
  mqttPublisher: MqttPublisherService,

) => ({
  
  redis: redisClient,
  findDeviceById: async (deviceId: string) => {
    if (!deviceId) {
      return null;
    }
    try{
      const device = await deviceRepository.findOne({serialNumber: deviceId});
  
      if (!device) {
        logger.warn(`Device lookup failed during plugin configuration for serial: ${deviceId}`);
        return null;
      }

      return {
        id: device.id,
        serialNumber: device.serialNumber,
        name: device.name,
        type: device.type,

        model: device.modelVersion?.modelId,
        version: device.modelVersion?.version,
        schema: device.modelVersion?.schema,
        mapping: device.modelVersion?.mapping,
        status: device.status,

      };
    }catch(err:any){
    logger.error(`Failed loading device ${deviceId}: ${err.message}` );
    throw err;
    }
  },

  onTelemetry: async (telemetry: DeviceTelemetry) => {
    if (!telemetry || !telemetry.deviceId) {
    throw new Error('INVALID_TELEMETRY_DATA');
    }
    try{
      logger.debug(`Forwarding telemetry from plugin to telemetry service for device: ${telemetry.deviceId}`);
      await deviceTelemetryService.handleTelemetry(telemetry);
    }catch(err:any){

    logger.error(`[CONFIG HOOK] Telemetry processing failed for ${telemetry.deviceId}: ${err.message}`);
    throw err;

    }
  },
  onAttributes: async (
    deviceId: string,
    attributes: DeviceAttributes,
  ) => {
    if (!deviceId || !attributes) {
      throw new Error('INVALID_DEVICE_ATTRIBUTES');
    }

    logger.debug(
      `Persisting validated attributes for device: ${deviceId}`,
    );
    await deviceRepository.updateAttributes(
      deviceId,
      attributes as any,
    );

    try {
      await redisClient.del(`cache:device:${deviceId}`);
    } catch (error: any) {
      logger.warn(
        `Attributes were persisted, but the device cache could not be invalidated for ${deviceId}: ${error.message}`,
      );
    }
  },
  onStatusChange: async (deviceId: string, status: string) => {
    try{
      logger.log(`[CONFIG HOOK] Routing status change for ${deviceId} to telemetry service`);
      await deviceTelemetryService.handleStatusChange(deviceId, status);
    }catch(err:any){

      logger.error(`[CONFIG HOOK] Status update failed for ${deviceId}: ${err.message}`);
      throw err;

    }
  },
 sendCommand: async (
   deviceId: string,
   command: string,
   payload?: any,
   context?: CommandDispatchContext,
 ) => {

   await mqttPublisher.publish('command', deviceId, {
     command,
     payload,
     ...(context?.correlationId
       ? { correlationId: context.correlationId }
       : {}),
   });
},
getLatestTelemetry: async (deviceId: string) => {
  return await deviceTelemetryService.getLatestTelemetry(deviceId);
},
});