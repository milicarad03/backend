import { DeviceRepository } from './device.repository';
import { DeviceTelemetryService } from './device-telemetry.service';
import { Logger } from '@nestjs/common';
import { DeviceStatus } from '../generated/prisma/client.js';
import Redis from 'ioredis';
import { MqttPublisherService } from 'src/mqtt/mqtt-publisher.service';

export type DeviceTelemetry = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

const logger = new Logger('DeviceDashboardConfig');
/*const redisClient = new Redis({host: 'localhost',
  port: 6379,
});*/

//redisClient.on('connect', () => logger.log('Successfully connected to Redis Server.'));
//redisClient.on('error', (err) => logger.error(`Redis connection error: ${err.message}`));

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
  onStatusChange: async (deviceId: string, status: string) => {
    try{
      logger.log(`[CONFIG HOOK] Routing status change for ${deviceId} to telemetry service`);
      await deviceTelemetryService.handleStatusChange(deviceId, status);
    }catch(err:any){

      logger.error(`[CONFIG HOOK] Status update failed for ${deviceId}: ${err.message}`);
      throw err;

    }
  },
 sendCommand: async (deviceId: string, command: string, payload?: any) => {

  /*logger.error(
    `[MQTT SEND]
     device=${deviceId}
     command=${command}
     payload=${JSON.stringify(payload)}
     stack=${new Error().stack}`
  );*/

   await mqttPublisher.publish('command', deviceId, {
     command,
     payload, 
   });
},
getLatestTelemetry: async (deviceId: string) => {
  return await deviceTelemetryService.getLatestTelemetry(deviceId);
},
});