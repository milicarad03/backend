import { Injectable } from '@nestjs/common';

export type CoapDeviceRegistration = {
  deviceId: string;
  commandEndpoint: string;
  registeredAt: string;
};

@Injectable()
export class CoapDeviceRegistryService {
  private readonly devices = new Map<string, CoapDeviceRegistration>();

  register(deviceId: string, commandEndpoint: string): CoapDeviceRegistration {
    const normalizedDeviceId = deviceId.trim();
    const endpoint = new URL(commandEndpoint);

    if (!normalizedDeviceId) {
      throw new Error('COAP_DEVICE_ID_REQUIRED');
    }

    if (endpoint.protocol !== 'coap:') {
      throw new Error('COAP_COMMAND_ENDPOINT_PROTOCOL_INVALID');
    }

    if (!endpoint.hostname || !endpoint.port) {
      throw new Error('COAP_COMMAND_ENDPOINT_INCOMPLETE');
    }

    endpoint.pathname = '/commands';
    endpoint.search = '';
    endpoint.hash = '';

    const registration = {
      deviceId: normalizedDeviceId,
      commandEndpoint: endpoint.toString(),
      registeredAt: new Date().toISOString(),
    };

    this.devices.set(normalizedDeviceId, registration);
    return registration;
  }

  unregister(deviceId: string): boolean {
    return this.devices.delete(deviceId);
  }

  get(deviceId: string): CoapDeviceRegistration | undefined {
    return this.devices.get(deviceId);
  }

  has(deviceId: string): boolean {
    return this.devices.has(deviceId);
  }

  clear(): void {
    this.devices.clear();
  }
}
