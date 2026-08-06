import { Injectable, OnModuleDestroy, OnModuleInit, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';
import { DeviceDashboardService } from 'serverplugin';
//import { PluginErrorCode } from 'serverplugin';
import * as fs from 'fs';
import * as path from 'path';
import { MqttPublisherService } from './mqtt-publisher.service';
import {
  DeviceNotFoundException,
  DeviceOfflineException,
  DeviceUninitializedException,
  ConfigMissingException,
  ConfigMismatchException,
  NormalizationFailedException,
  HookFailedException,
  InvalidTimestampException,
  SchemaCompileException,
  DatabaseFailureException,
  CommandValidationException,
} from 'serverplugin';

export type TelemetryContext = {
  deviceId: string;
  topic: string;
  transport: 'mqtt';
};

type ProcessTelemetryCallback = (
  message: unknown,
  context: TelemetryContext,
) => Promise<{ approved: boolean; reason?: string }>;

type ProcessStatusCallback = (
  message: unknown,
  context: TelemetryContext,
) => Promise<void>;

@Injectable()
export class MqttTransportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttTransportService.name);
  private client: MqttClient | null = null;
  private readonly brokerUrl = 'mqtt://localhost:1883';

  constructor(
    private readonly pluginCore: DeviceDashboardService,
    private readonly mqttPublisher :MqttPublisherService
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.disconnect();
  }
  private loadTopics(): string[] {
  const configPath = path.join(
    process.cwd(),
    '/config/mqtt.config.json'
  );

  const config = JSON.parse(
    fs.readFileSync(configPath, 'utf8')
  );

  return config.subscriptions ?? [];
}
  private connect() {
    if (this.client) return;
    this.client = mqtt.connect(this.brokerUrl);

    this.client.on('connect', () => {
      this.logger.log(`Successfully connected to MQTT broker at ${this.brokerUrl}`);

      //const topicsToSubscribe = this.pluginCore.getSubscriptionTopics();
      const topicsToSubscribe = this.loadTopics();

      topicsToSubscribe.forEach((topic) => {
        this.client?.subscribe(topic, (error) => {
          if (error) {
            this.logger.error(`Failed to subscribe to MQTT topic: ${topic}`, error.stack);
            return;
          }
          this.logger.log(`Dynamically subscribed to MQTT topic: ${topic}`);
        });
      });
    });

    this.client.on('message', (topic, payload, packet : any) => {
      if (packet?.retain) {
          this.logger.warn(
            `[RETAINED] ${topic}`
          );
        }
      this.handleMessage(
        topic,
        payload,
        packet,
        this.pluginCore.processTelemetry.bind(this.pluginCore),
        this.pluginCore.processStatus.bind(this.pluginCore),
      ).catch((error) => {
        this.logger.error(`Unhandled exception in MQTT message pipeline for topic ${topic}: ${error.message}`, error.stack);
      });
    });

    this.client.on('error', (error) => {
      this.logger.error(`MQTT client connection error: ${error.message}`, error.stack);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('MQTT broker connection lost. Attempting to reconnect...');
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT client switched to offline state.');
    });

    this.client.on('close', () => {
      this.logger.warn('MQTT connection stream closed.');
    });
  }

  private extractDeviceIdFromTopic(topic: string): string | null {
    const match = topic.match(/^iot\/devices\/([^/]+)\/(telemetry|status)$/);
    return match ? match[1] : null;
  }

  private async handleMessage(
    topic: string,
    payload: Buffer,
    packet: mqtt.Packet,
    processTelemetry: ProcessTelemetryCallback,
    processStatus: ProcessStatusCallback,
  ) {
    try {
      const topicDeviceId = this.extractDeviceIdFromTopic(topic);

      if (!topicDeviceId) {
        this.logger.warn(`Received message on unsupported MQTT topic syntax: ${topic}`);
        return;
      }

      const message = JSON.parse(payload.toString());
      

      const context: TelemetryContext = {
        deviceId: topicDeviceId,
        topic,
        transport: 'mqtt',
      };

      if (topic.endsWith('/telemetry')) {
        this.logger.debug(`Received raw telemetry for ${context.deviceId}: ${JSON.stringify(message, null, 2)}`);
        this.logger.debug(`Incoming telemetry stream payload detected for device: ${context.deviceId}`);

        const result = await processTelemetry(message, context);

        if (!result.approved) {

          this.logger.warn(`Plugin validation rejected telemetry frame for device [${context.deviceId}]. Reason: ${result.reason || 'UNKNOWN'}`);
          
          if (result.reason === 'INVALID_TELEMETRY_SCHEMA'  ||  result.reason === 'CONFIG_MISMATCH') {

              await this.mqttPublisher.publish(
                'command',
                context.deviceId,
                {
                  command: 'STOP_DEVICE',
                  reason: 'INVALID_TELEMETRY_SCHEMA',
                },
              );
            }

          
          return;
        }

        this.logger.debug(`Telemetry packet successfully verified and forwarded to plugin for device: ${context.deviceId}`);
        return;
      }

      if (topic.endsWith('/status')) {

        const publishPacket = packet as any;

        if (publishPacket?.retain) {
          this.logger.debug(`Ignoring retained status for ${context.deviceId}`,);
          return;
        }
        this.logger.log(`Incoming operational status event update for device: ${context.deviceId}`);

        await processStatus(message, context);

        this.logger.debug(`Status event successfully processed by plugin for device: ${context.deviceId}`);
        return;
      }

      this.logger.warn(`Unknown action type match for topic destination route: ${topic}`);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`[NOT_FOUND] ${error.message}`);
        return;
      } 
      
      if (error instanceof ForbiddenException) {
        this.logger.warn(`[SECURITY] ${error.message}`);
        return;
      }
      if (error instanceof InvalidTimestampException) {
        this.logger.warn('[VALIDATION] Device sent invalid timestamp.');
        return;
      }
      if (error instanceof DeviceOfflineException) {
        this.logger.warn(error.message);
        return;
      }

      if (error instanceof DeviceUninitializedException) {
        this.logger.warn(error.message);
        return;
      }

      if (error instanceof ConfigMissingException) {
        this.logger.warn(error.message);
        return;
      }

      if (error instanceof ConfigMismatchException) {
        this.logger.warn(error.message);
        return;
      }

      if (error instanceof DatabaseFailureException) {
        this.logger.error(error.message);
        return;
      }

      if (error instanceof SchemaCompileException) {
        this.logger.error(error.message);
        return;
      }
      if (error instanceof NormalizationFailedException) {
        this.logger.warn('[NORMALIZATION] Device data does not match mapping definitions.');
        return;
      }

      if (error instanceof HookFailedException) {
        this.logger.error('[INTERNAL] Host application failed to process telemetry.');
        return;
      }

      if (error instanceof CommandValidationException) {
        this.logger.warn(error.message);
        return;
      }

      if (error instanceof DeviceNotFoundException) {
        this.logger.warn(error.message);
        return;
      }
      this.logger.error(`[UNHANDLED_EXCEPTION] ${error.message}`, error.stack);
    /*  const isPluginError = Object.values(PluginErrorCode).includes(error.message);

        if (isPluginError) {
          this.handlePluginError(error.message as PluginErrorCode);
        } else {
          this.logger.error(`[UNHANDLED_EXCEPTION] ${error.message}`, error.stack);
        }*/
      //this.logger.error(`Failed to parse or process incoming MQTT payload on topic [${topic}]: ${error.message}`, error.stack);
    }
  }

async publish(topic: string, message: any) {

  if (!this.client || !this.client.connected) {
    this.logger.warn(`MQTT client is offline, ignoring command to topic: ${topic}`);
    return;
  }
  
  return new Promise<void>((resolve, reject) => {
    this.client!.publish(topic, JSON.stringify(message), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
  /*private handlePluginError(code: PluginErrorCode) {
    switch (code) {
      case PluginErrorCode.DATABASE_FAILURE:
        this.logger.error("[CRITICAL] Database service is unavailable. Telemetry processing halted.");
        break;

      case PluginErrorCode.NORMALIZATION_FAILED:
        this.logger.warn("[NORMALIZATION] Device data does not match mapping definitions. Please check the mapping schema.");
        break;

      case PluginErrorCode.HOOK_FAILED:
        this.logger.error("[INTERNAL] Host application failed to process telemetry (onTelemetry hook error).");
        break;

      case PluginErrorCode.CONFIG_MISSING:
        this.logger.warn("[CONFIG] Device is missing required mapping or schema configuration. Please check the /schema folder.");
        break;

      case PluginErrorCode.CONFIG_MISMATCH:
        this.logger.warn("[CONFIG] Device model and schema ID mismatch. Please verify the device configuration.");
        break;
      case PluginErrorCode.INVALID_TIMESTAMP:
        this.logger.warn("[VALIDATION] Telemetry timestamp could not be parsed.");
        break;
 
      case PluginErrorCode.SCHEMA_COMPILE_ERROR:
        this.logger.error("[CRITICAL] JSON schema for device model failed to compile. Check schema file syntax.");
        break;


      default:
        this.logger.error(`[UNKNOWN_ERROR] Plugin reported an unhandled error code: ${code}`);
        break;
    }
  }*/

  private disconnect() {
    if (this.client) {
      this.logger.log('Gracefully disconnecting MQTT transport client network stream...');
      this.client.removeAllListeners();
      this.client.end();
      this.client = null;
    }else {
      this.logger.warn('Disconnect triggered but MQTT client instance was already uninitialized.');
    }
  }
}