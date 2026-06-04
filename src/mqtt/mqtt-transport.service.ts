// host-src/mqtt/mqtt-transport.service.ts

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
      console.log('[HOST MQTT] Uspešno povezan na MQTT broker');

      const topicsToSubscribe = this.pluginCore.getSubscriptionTopics();

      topicsToSubscribe.forEach((topic) => {
        this.client?.subscribe(topic, (error) => {
          if (error) {
            console.error(
              `[HOST MQTT] Greška pri pretplati na topic ${topic}:`,
              error,
            );
            return;
          }

          console.log(`[HOST MQTT] Dinamički pretplaćen na topic: ${topic}`);
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
        console.error('[HOST MQTT] Error handling message:', error);
      });
    });

    this.client.on('error', (error) => {
      console.error('[HOST MQTT] MQTT connection error:', error.message);
    });

    this.client.on('reconnect', () => {
      console.warn('[HOST MQTT] Reconnecting to MQTT broker...');
    });

    this.client.on('offline', () => {
      console.warn('[HOST MQTT] MQTT client offline');
    });

    this.client.on('close', () => {
      console.warn('[HOST MQTT] MQTT connection closed');
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
        console.warn('[HOST MQTT] Nepodržan topic:', topic);
        return;
      }

      const message = JSON.parse(payload.toString());

      const context: TelemetryContext = {
        deviceId: topicDeviceId,
        topic,
        transport: 'mqtt',
      };

      if (topic.endsWith('/telemetry')) {
        console.log(
          '[HOST MQTT] Primljena telemetrija, šaljem pluginu na validaciju...',
        );

        const result = await processTelemetry(message, context);

        if (!result.approved) {
          console.warn('[HOST MQTT] Plugin je odbio telemetry paket:', {
            reason: result.reason,
            deviceId: context.deviceId,
            topic,
          });
          return;
        }

        console.log('[HOST MQTT] Telemetrija uspešno prosleđena pluginu.');
        return;
      }

      if (topic.endsWith('/status')) {
        console.log('[HOST MQTT] Primljen status, šaljem pluginu na obradu...');

        await processStatus(message, context);

        console.log('[HOST MQTT] Status uspešno prosleđen pluginu.');
        return;
      }

      console.warn('[HOST MQTT] Nepoznat tip topic-a:', topic);
    } catch (error: any) {
      console.error('[HOST MQTT] Nevalidan JSON payload:', {
        topic,
        error: error.message,
      });
    }
  }

  private disconnect() {
    this.client?.end();
    this.client = null;
  }
}