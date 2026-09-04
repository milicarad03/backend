import { Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { CoapCommandService } from '../coap/coap-command.service';
import { CoapDeviceRegistryService } from '../coap/coap-device-registry.service';
import {
  MqttCommandService,
  type DeviceCommandResponse,
} from '../mqtt/mqtt-command.service';

export type CommandTransport = 'mqtt' | 'coap';

export type RoutedDeviceCommandResponse = DeviceCommandResponse & {
  transport: CommandTransport;
  transportRoundTripMs: number;
};

@Injectable()
export class DeviceCommandService {
  constructor(
    private readonly mqttCommandService: MqttCommandService,
    private readonly coapCommandService: CoapCommandService,
    private readonly coapRegistry: CoapDeviceRegistryService,
  ) {}

  async sendCommandAndWaitForResponse(
    deviceId: string,
    command: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 10_000,
    correlationId?: string,
  ): Promise<RoutedDeviceCommandResponse> {
    const transport: CommandTransport = this.coapRegistry.has(deviceId)
      ? 'coap'
      : 'mqtt';
    const startedAt = performance.now();
    let response: DeviceCommandResponse;

    try {
      response =
        transport === 'coap'
          ? await this.coapCommandService.sendCommandAndWaitForResponse(
              deviceId,
              command,
              payload,
              timeoutMs,
              correlationId,
            )
          : await this.mqttCommandService.sendCommandAndWaitForResponse(
              deviceId,
              command,
              payload,
              timeoutMs,
              correlationId,
            );
    } catch (error) {
      if (transport === 'coap') {
        this.coapRegistry.unregister(deviceId);
      }
      throw error;
    }

    return {
      ...response,
      transport,
      transportRoundTripMs: Number(
        (performance.now() - startedAt).toFixed(3),
      ),
    };
  }
}
