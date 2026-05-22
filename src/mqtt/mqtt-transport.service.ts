// host-src/mqtt/mqtt-transport.service.ts

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';

import { DeviceDashboardService } from 'serverplugin'; 

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
      console.log('[HOST MQTT] Connected to broker');
      this.client?.subscribe('iot/devices/+/telemetry');
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload).catch((err) => {
        console.error('[HOST MQTT] Error handling message:', err);
      });
    });
  }

  private async handleMessage(topic: string, payload: Buffer) {
    try {
      
      const message = JSON.parse(payload.toString());

      if (topic.endsWith('/telemetry')) {
        console.log('[HOST MQTT] Primljena telemetrija, šaljem pluginu na validaciju...');

        
        const result = await this.pluginCore.processTelemetry({
          deviceId: message.deviceId,
          timestamp: message.timestamp,
          data: message.data,
        });

        if (!result.approved) {
          console.warn(`[HOST MQTT] Plugin je odbio paket. Razlog: ${result.reason}`);
        }
      }
    } catch (error: any) {
      console.error('[HOST MQTT] Nevalidan JSON payload:', error.message);
    }
  }

  private disconnect() {
    this.client?.end();
  }
}