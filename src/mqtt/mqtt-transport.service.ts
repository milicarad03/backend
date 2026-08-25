import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';
import { DeviceDashboardService } from 'serverplugin';
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
import { randomUUID } from 'crypto';
import { DeviceRepository } from 'src/device/device.repository';

export type TelemetryContext = {
  deviceId: string;
  topic: string;
  transport: 'mqtt';
};

export type DeviceCommandResponse = {
  deviceId: string;
  timestamp?: string;
  command: string;
  correlationId?: string;
  success: boolean;
  error?: string;
  [key: string]: unknown;
};

type PendingResponse = {
  resolve: (response: DeviceCommandResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
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
export class MqttTransportService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MqttTransportService.name);
  private client: MqttClient | null = null;
  private readonly pendingResponses = new Map<
    string,
    PendingResponse
  >();
  private readonly brokerUrl =
    process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';

  constructor(
    private readonly pluginCore: DeviceDashboardService,
    private readonly mqttPublisher: MqttPublisherService,
    private readonly deviceRepository: DeviceRepository,
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    for (const [key, pending] of this.pendingResponses.entries()) {
      clearTimeout(pending.timer);
      pending.reject(
        new Error(`MQTT_TRANSPORT_SHUTDOWN:${key}`),
      );
    }

    this.pendingResponses.clear();
    this.disconnect();
  }

  // ==================================================
  // INITIALIZATION
  // ==================================================

  private loadTopics(): string[] {
    const configPath = path.join(
      process.cwd(),
      '/config/mqtt.config.json',
    );

    const config = JSON.parse(
      fs.readFileSync(configPath, 'utf8'),
    );

    return config.subscriptions ?? [];
  }

  private connect() {
    if (this.client) return;

    this.client = mqtt.connect(this.brokerUrl);

    this.client.on('connect', () => {
      this.logger.log(
        `Successfully connected to MQTT broker at ${this.brokerUrl}`,
      );

      const topicsToSubscribe = this.loadTopics();

      topicsToSubscribe.forEach((topic) => {
        this.client?.subscribe(topic, (error) => {
          if (error) {
            this.logger.error(
              `Failed to subscribe to MQTT topic: ${topic}`,
              error.stack,
            );
            return;
          }
          this.logger.log(
            `Dynamically subscribed to MQTT topic: ${topic}`,
          );
        });
      });
    });

    this.client.on(
      'message',
      (topic, payload, packet: any) => {
        if (packet?.retain) {
          this.logger.warn(`[RETAINED] ${topic}`);
        }

        this.handleMessage(
          topic,
          payload,
          packet,
          this.pluginCore.processTelemetry.bind(
            this.pluginCore,
          ),
          this.pluginCore.processStatus.bind(
            this.pluginCore,
          ),
        ).catch((error) => {
          this.logger.error(
            `Unhandled exception in MQTT message pipeline for topic ${topic}: ${error.message}`,
            error.stack,
          );
        });
      },
    );

    this.client.on('error', (error) => {
      this.logger.error(
        `MQTT client connection error: ${error.message}`,
        error.stack,
      );
    });

    this.client.on('reconnect', () => {
      this.logger.warn(
        'MQTT broker connection lost. Attempting to reconnect...',
      );
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT client switched to offline state.');
    });

    this.client.on('close', () => {
      this.logger.warn('MQTT connection stream closed.');
    });
  }

  private disconnect() {
    if (this.client) {
      this.logger.log(
        'Gracefully disconnecting MQTT transport client network stream...',
      );
      this.client.removeAllListeners();
      this.client.end();
      this.client = null;
    } else {
      this.logger.warn(
        'Disconnect triggered but MQTT client instance was already uninitialized.',
      );
    }
  }

  // ==================================================
  // MESSAGE HANDLING
  // ==================================================

  private extractDeviceIdFromTopic(
    topic: string,
  ): string | null {
    const match = topic.match(
      /^iot\/devices\/([^/]+)\/(telemetry|status|response|attributes)$/,
    );
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
      const topicDeviceId =
        this.extractDeviceIdFromTopic(topic);

      if (!topicDeviceId) {
        this.logger.warn(
          `Received message on unsupported MQTT topic syntax: ${topic}`,
        );
        return;
      }

      const message = JSON.parse(payload.toString());

      const context: TelemetryContext = {
        deviceId: topicDeviceId,
        topic,
        transport: 'mqtt',
      };

      // Handle response messages
      if (topic.endsWith('/response')) {
        this.handleCommandResponse(
          context.deviceId,
          message as DeviceCommandResponse,
        );
        return;
      }

      // Handle telemetry messages
      if (topic.endsWith('/telemetry')) {
        this.logger.debug(
          `Received raw telemetry for ${context.deviceId}: ${JSON.stringify(message, null, 2)}`,
        );
        this.logger.debug(
          `Incoming telemetry stream payload detected for device: ${context.deviceId}`,
        );

        const result = await processTelemetry(
          message,
          context,
        );

        if (!result.approved) {
          this.logger.warn(
            `Plugin validation rejected telemetry frame for device [${context.deviceId}]. Reason: ${result.reason || 'UNKNOWN'}`,
          );

          if (
            result.reason ===
              'INVALID_TELEMETRY_SCHEMA' ||
            result.reason === 'CONFIG_MISMATCH'
          ) {
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

        this.logger.debug(
          `Telemetry packet successfully verified and forwarded to plugin for device: ${context.deviceId}`,
        );
        return;
      }
      // Handle attribute messages
     /* if (topic.endsWith('/attributes')) {
        this.logger.log(
          `Incoming device attributes update for device: ${context.deviceId}`,
        );

        try {
          await this.deviceRepository.updateAttributes(
            context.deviceId,
            message,
          );

          this.logger.debug(
            `Attributes successfully updated in database for device: ${context.deviceId}`,
          );
        } catch (dbError: any) {
          this.logger.error(
            `Failed to save attributes for device ${context.deviceId}: ${dbError.message}`,
            dbError.stack,
          );
        }
        return;
      }*/

      // Handle status messages
      if (topic.endsWith('/status')) {
        const publishPacket = packet as any;

        if (publishPacket?.retain) {
          this.logger.debug(
            `Ignoring retained status for ${context.deviceId}`,
          );
          return;
        }

        this.logger.log(
          `Incoming operational status event update for device: ${context.deviceId}`,
        );

        await processStatus(message, context);

        this.logger.debug(
          `Status event successfully processed by plugin for device: ${context.deviceId}`,
        );
        return;
      }

      this.logger.warn(
        `Unknown action type match for topic destination route: ${topic}`,
      );
    } catch (error: any) {
      this.handleMessageError(error);
    }
  }

  private handleMessageError(error: any) {
    if (error instanceof NotFoundException) {
      this.logger.warn(`[NOT_FOUND] ${error.message}`);
      return;
    }

    if (error instanceof ForbiddenException) {
      this.logger.warn(`[SECURITY] ${error.message}`);
      return;
    }

    if (error instanceof InvalidTimestampException) {
      this.logger.warn(
        '[VALIDATION] Device sent invalid timestamp.',
      );
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
      this.logger.warn(
        '[NORMALIZATION] Device data does not match mapping definitions.',
      );
      return;
    }

    if (error instanceof HookFailedException) {
      this.logger.error(
        '[INTERNAL] Host application failed to process telemetry.',
      );
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

    this.logger.error(
      `[UNHANDLED_EXCEPTION] ${error.message}`,
      error.stack,
    );
  }



  private responseKey(
    deviceId: string,
    command: string,
    correlationId: string,
  ): string {
    return `${deviceId}:${command}:${correlationId}`;
  }

  private handleCommandResponse(
    deviceId: string,
    message: DeviceCommandResponse,
  ): void {
    if (!message?.command || !message?.correlationId) {
      this.logger.debug(
        `[MQTT RESPONSE] Ignoring response without correlationId from ${deviceId}`,
      );
      return;
    }

    const key = this.responseKey(
      deviceId,
      message.command,
      message.correlationId,
    );

    const pending = this.pendingResponses.get(key);

    if (!pending) {
      this.logger.debug(
        `[MQTT RESPONSE] No pending request for ${key}`,
      );
      return;
    }

    clearTimeout(pending.timer);
    this.pendingResponses.delete(key);
    pending.resolve(message);
  }

  async sendCommandAndWaitForResponse(
    deviceId: string,
    command: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 10000,
  ): Promise<DeviceCommandResponse> {
    const correlationId = randomUUID();

    const key = this.responseKey(
      deviceId,
      command,
      correlationId,
    );

    const responsePromise = new Promise<DeviceCommandResponse>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingResponses.delete(key);

          reject(
            new Error(
              `DEVICE_RESPONSE_TIMEOUT:${command}`,
            ),
          );
        }, timeoutMs);

        this.pendingResponses.set(key, {
          resolve,
          reject,
          timer,
        });
      },
    );

    try {
      await this.mqttPublisher.publish('command', deviceId, {
        command,
        payload: {
          ...payload,
          correlationId,
        },
      });
    } catch (error) {
      const pending = this.pendingResponses.get(key);

      if (pending) {
        clearTimeout(pending.timer);
      }

      this.pendingResponses.delete(key);
      throw error;
    }

    return responsePromise;
  }

  async publish(topic: string, message: any) {
    if (!this.client || !this.client.connected) {
      this.logger.warn(
        `MQTT client is offline, ignoring command to topic: ${topic}`,
      );
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.client!.publish(
        topic,
        JSON.stringify(message),
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }
}