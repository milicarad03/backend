import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DeviceCommandResponse } from '../mqtt/mqtt-command.service';
import { CoapDeviceRegistryService } from './coap-device-registry.service';

const coap: any = require('coap');

const MAX_RESPONSE_BYTES = 64 * 1024;
const BLOCK1_SIZE_EXPONENT = 6;
const BLOCK1_SIZE_BYTES = 2 ** (BLOCK1_SIZE_EXPONENT + 4);

@Injectable()
export class CoapCommandService {
  constructor(private readonly registry: CoapDeviceRegistryService) {}

  async sendCommandAndWaitForResponse(
    deviceId: string,
    command: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 10_000,
    correlationId: string = randomUUID(),
  ): Promise<DeviceCommandResponse> {
    const registration = this.registry.get(deviceId);

    if (!registration) {
      throw new Error(`COAP_DEVICE_ENDPOINT_NOT_REGISTERED:${deviceId}`);
    }

    const endpoint = new URL(registration.commandEndpoint);
    const envelope = {
      command,
      payload: {
        ...payload,
        correlationId,
      },
      correlationId,
    };
    const requestBody = Buffer.from(JSON.stringify(envelope), 'utf8');

    return new Promise<DeviceCommandResponse>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout;
      const finish = (
        action: () => void,
      ) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        action();
      };
      const request = coap.request({
        hostname: endpoint.hostname,
        port: Number(endpoint.port),
        pathname: endpoint.pathname,
        method: 'POST',
        confirmable: true,
      });
      timer = setTimeout(() => {
        request.abort();
        finish(() => reject(new Error(`DEVICE_RESPONSE_TIMEOUT:${command}`)));
      }, timeoutMs);

      request.setOption('Content-Format', 'application/json');
      request.setOption('Accept', 'application/json');

      if (requestBody.length > BLOCK1_SIZE_BYTES) {
        request.setOption(
          'Block1',
          Buffer.from([BLOCK1_SIZE_EXPONENT]),
        );
      }

      request.once('error', (error: Error) => {
        finish(() => reject(error));
      });

      request.once('response', (response: any) => {
        const chunks: Buffer[] = [];
        let responseBytes = 0;

        response.on('data', (chunk: Buffer) => {
          responseBytes += chunk.length;

          if (responseBytes <= MAX_RESPONSE_BYTES) {
            chunks.push(chunk);
          }
        });

        response.once('end', () => {
          finish(() => {
            if (responseBytes > MAX_RESPONSE_BYTES) {
              reject(new Error('COAP_COMMAND_RESPONSE_TOO_LARGE'));
              return;
            }

            if (!String(response.code ?? '').startsWith('2.')) {
              reject(
                new Error(
                  `COAP_COMMAND_REJECTED:${response.code ?? 'UNKNOWN'}`,
                ),
              );
              return;
            }

            let parsed: DeviceCommandResponse;

            try {
              parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              reject(new Error('COAP_COMMAND_RESPONSE_INVALID_JSON'));
              return;
            }

            if (
              parsed.deviceId !== deviceId ||
              parsed.command !== command ||
              parsed.correlationId !== correlationId ||
              typeof parsed.success !== 'boolean'
            ) {
              reject(new Error('COAP_COMMAND_RESPONSE_MISMATCH'));
              return;
            }

            resolve(parsed);
          });
        });
      });

      request.end(requestBody);
    });
  }
}
