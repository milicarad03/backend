import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';
import * as config from '../../config/mqtt.config.json';



@Injectable()
export class MqttPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttPublisherService.name);

  private client: MqttClient | null = null;
  private readonly brokerUrl =
    process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';


  private getTopic(key: string, deviceId: string): string {
    const template = config.publish[key];
    return template.replace('%s', deviceId);
  }
 

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

  async publish(topicKey: string, deviceId:string, payload: unknown): Promise<void> {
    const topic = this.getTopic(topicKey, deviceId);
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