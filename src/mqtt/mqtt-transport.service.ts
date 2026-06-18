import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';
import { DeviceDashboardService } from 'serverplugin';

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

  constructor(private readonly pluginCore: DeviceDashboardService) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.disconnect();
  }

  private connect() {
    this.client = mqtt.connect(this.brokerUrl);

    this.client.on('connect', () => {
      this.logger.log(`Successfully connected to MQTT broker at ${this.brokerUrl}`);

      const topicsToSubscribe = this.pluginCore.getSubscriptionTopics();

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

    this.client.on('message', (topic, payload) => {
      this.handleMessage(
        topic,
        payload,
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
          return;
        }

        this.logger.debug(`Telemetry packet successfully verified and forwarded to plugin for device: ${context.deviceId}`);
        return;
      }

      if (topic.endsWith('/status')) {
        this.logger.log(`Incoming operational status event update for device: ${context.deviceId}`);

        await processStatus(message, context);

        this.logger.debug(`Status event successfully processed by plugin for device: ${context.deviceId}`);
        return;
      }

      this.logger.warn(`Unknown action type match for topic destination route: ${topic}`);
    } catch (error: any) {
      this.logger.error(`Failed to parse or process incoming MQTT payload on topic [${topic}]: ${error.message}`, error.stack);
    }
  }

  private disconnect() {
    if (this.client) {
      this.logger.log('Gracefully disconnecting MQTT transport client network stream...');
      this.client.end();
      this.client = null;
    }else {
      this.logger.warn('Disconnect triggered but MQTT client instance was already uninitialized.');
    }
  }
}