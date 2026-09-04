import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MqttPublisherService } from './mqtt-publisher.service';

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

@Injectable()
export class MqttCommandService implements OnModuleDestroy {
  private readonly pendingResponses = new Map<string, PendingResponse>();

  constructor(private readonly mqttPublisher: MqttPublisherService) {}

  onModuleDestroy(): void {
    for (const [key, pending] of this.pendingResponses.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`MQTT_COMMAND_SERVICE_SHUTDOWN:${key}`));
    }

    this.pendingResponses.clear();
  }

  handleResponse(
    deviceId: string,
    response: DeviceCommandResponse,
  ): boolean {
    if (
      !response?.command ||
      !response.correlationId ||
      response.deviceId !== deviceId
    ) {
      return false;
    }

    const key = this.responseKey(
      deviceId,
      response.command,
      response.correlationId,
    );
    const pending = this.pendingResponses.get(key);

    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingResponses.delete(key);
    pending.resolve(response);
    return true;
  }

  async sendCommandAndWaitForResponse(
    deviceId: string,
    command: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 10_000,
    correlationId: string = randomUUID(),
  ): Promise<DeviceCommandResponse> {
    const key = this.responseKey(deviceId, command, correlationId);

    if (this.pendingResponses.has(key)) {
      throw new Error(`DUPLICATE_PENDING_COMMAND:${key}`);
    }

    const responsePromise = new Promise<DeviceCommandResponse>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingResponses.delete(key);
          reject(new Error(`DEVICE_RESPONSE_TIMEOUT:${command}`));
        }, timeoutMs);

        this.pendingResponses.set(key, { resolve, reject, timer });
      },
    );

    try {
      await this.mqttPublisher.publish('command', deviceId, {
        command,
        payload: {
          ...payload,
          correlationId,
        },
        correlationId,
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

  private responseKey(
    deviceId: string,
    command: string,
    correlationId: string,
  ): string {
    return `${deviceId}:${command}:${correlationId}`;
  }
}
