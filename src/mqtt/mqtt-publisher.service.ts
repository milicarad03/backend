import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';

@Injectable()
export class MqttPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttPublisherService.name);

  private client: MqttClient | null = null;
  private readonly brokerUrl = 'mqtt://localhost:1883';

  onModuleInit() {
    this.client = mqtt.connect(this.brokerUrl);

    this.client.on('connect', () => {
      this.logger.log(`MQTT publisher connected to ${this.brokerUrl}`);
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT publisher error: ${err.message}`);
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }

  async publish(topic: string, payload: unknown): Promise<void> {
    if (!this.client) {
      throw new Error('MQTT_PUBLISHER_NOT_CONNECTED');
    }

    return new Promise((resolve, reject) => {
      this.client!.publish(
        topic,
        JSON.stringify(payload),
        (err?: Error) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        },
      );
    });
  }
}