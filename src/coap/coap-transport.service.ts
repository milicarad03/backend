import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DeviceDashboardService } from 'serverplugin';
import { DeviceCommandService } from '../device/device-command.service';
import { CoapDeviceRegistryService } from './coap-device-registry.service';

const coap: any = require('coap');

const MAX_PAYLOAD_BYTES = 64 * 1024;

type CoapMessageKind = 'telemetry' | 'attributes' | 'status';

@Injectable()
export class CoapTransportService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CoapTransportService.name);
  private readonly enabled = process.env.COAP_ENABLED === 'true';
  private readonly host = process.env.COAP_HOST ?? '127.0.0.1';
  private readonly port = Number(process.env.COAP_PORT ?? 5683);
  private server: any = null;

  constructor(
    private readonly pluginCore: DeviceDashboardService,
    private readonly registry: CoapDeviceRegistryService,
    private readonly commandService: DeviceCommandService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('CoAP transport is disabled. MQTT remains the default.');
      return;
    }

    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535) {
      throw new Error('COAP_PORT_INVALID');
    }

    this.server = coap.createServer((request: any, response: any) => {
      this.handleRequest(request, response).catch((error) => {
        if (
          error?.message === 'COAP_PAYLOAD_TOO_LARGE' ||
          error?.message === 'COAP_PAYLOAD_INVALID_JSON'
        ) {
          this.respond(response, '4.00', { error: error.message });
          return;
        }

        this.logger.error(
          `Unhandled CoAP request error: ${error.message}`,
          error.stack,
        );
        this.respond(response, '5.00', { error: 'COAP_INTERNAL_ERROR' });
      });
    });

    this.server.on('error', (error: Error) => {
      this.logger.error(`CoAP server error: ${error.message}`, error.stack);
    });

    this.server.listen(this.port, this.host, () => {
      this.logger.log(`CoAP transport listening on coap://${this.host}:${this.port}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.registry.clear();

    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, 2_000);

      server.close(finish);
    });
  }

  private async handleRequest(request: any, response: any): Promise<void> {
    if (request.method !== 'POST') {
      this.respond(response, '4.05', { error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    const route = String(request.url ?? '').match(
      /^\/devices\/([^/]+)\/(telemetry|attributes|status)\/?$/,
    );

    if (!route) {
      this.respond(response, '4.04', { error: 'COAP_ROUTE_NOT_FOUND' });
      return;
    }

    let deviceId: string;

    try {
      deviceId = decodeURIComponent(route[1]);
    } catch {
      this.respond(response, '4.00', { error: 'DEVICE_ID_INVALID' });
      return;
    }

    const kind = route[2] as CoapMessageKind;
    const payload = await this.readJsonBody(request);
    const payloadDeviceId =
      typeof payload?.deviceId === 'string' ? payload.deviceId : undefined;

    if (payloadDeviceId && payloadDeviceId !== deviceId) {
      this.respond(response, '4.00', { error: 'DEVICE_ID_MISMATCH' });
      return;
    }

    const context = {
      deviceId,
      topic: request.url,
      transport: 'coap' as const,
    };

    if (kind === 'telemetry') {
      const result = await this.pluginCore.processTelemetry(payload, context);

      if (!result.approved) {
        if (
          result.reason === 'INVALID_TELEMETRY_SCHEMA' ||
          result.reason === 'CONFIG_MISMATCH'
        ) {
          await this.commandService
            .sendCommandAndWaitForResponse(
              deviceId,
              'STOP_DEVICE',
              { reason: 'INVALID_TELEMETRY_SCHEMA' },
            )
            .catch(() => undefined);
        }

        this.respond(response, '4.00', {
          approved: false,
          reason: result.reason ?? 'UNKNOWN',
        });
        return;
      }

      this.respond(response, '2.04', { approved: true });
      return;
    }

    if (kind === 'attributes') {
      const result = await this.pluginCore.processAttributes(payload, context);

      if (!result.approved) {
        this.respond(response, '4.00', {
          approved: false,
          reason: result.reason ?? 'UNKNOWN',
        });
        return;
      }

      this.respond(response, '2.04', { approved: true });
      return;
    }

    const status = String(payload?.status ?? '').toLowerCase();
    let registeredCoapEndpoint = false;

    if (status === 'online' && typeof payload?.commandEndpoint === 'string') {
      this.registry.register(deviceId, payload.commandEndpoint);
      registeredCoapEndpoint = true;
    } else if (status === 'offline') {
      this.registry.unregister(deviceId);
    }

    try {
      await this.pluginCore.processStatus(payload, context);
    } catch (error) {
      if (registeredCoapEndpoint) {
        this.registry.unregister(deviceId);
      }
      throw error;
    }

    this.respond(response, '2.04', { approved: true });
  }

  private readJsonBody(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let bytes = 0;

      request.on('data', (chunk: Buffer) => {
        bytes += chunk.length;

        if (bytes <= MAX_PAYLOAD_BYTES) {
          chunks.push(chunk);
        }
      });

      request.once('error', reject);
      request.once('end', () => {
        if (bytes > MAX_PAYLOAD_BYTES) {
          reject(new Error('COAP_PAYLOAD_TOO_LARGE'));
          return;
        }

        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('COAP_PAYLOAD_INVALID_JSON'));
        }
      });
    });
  }

  private respond(response: any, code: string, body: unknown): void {
    if (response.finished) {
      return;
    }

    response.code = code;
    response.setOption('Content-Format', 'application/json');
    response.end(JSON.stringify(body));
  }
}
