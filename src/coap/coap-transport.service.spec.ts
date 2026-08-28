import { PassThrough } from 'node:stream';
import { DeviceDashboardService } from 'serverplugin';
import { DeviceCommandService } from '../device/device-command.service';
import { CoapDeviceRegistryService } from './coap-device-registry.service';
import { CoapTransportService } from './coap-transport.service';

describe('CoapTransportService', () => {
  const pluginCore = {
    processTelemetry: jest.fn(),
    processAttributes: jest.fn(),
    processStatus: jest.fn(),
  };
  const registry = {
    register: jest.fn(),
    unregister: jest.fn(),
    clear: jest.fn(),
  };
  const commandService = {
    sendCommandAndWaitForResponse: jest.fn(),
  };
  let service: CoapTransportService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginCore.processTelemetry.mockResolvedValue({ approved: true });
    pluginCore.processAttributes.mockResolvedValue({ approved: true });
    pluginCore.processStatus.mockResolvedValue(undefined);
    service = new CoapTransportService(
      pluginCore as unknown as DeviceDashboardService,
      registry as unknown as CoapDeviceRegistryService,
      commandService as unknown as DeviceCommandService,
    );
  });

  const send = async (kind: string, body: unknown) => {
    const request = new PassThrough() as PassThrough & {
      method: string;
      url: string;
    };
    request.method = 'POST';
    request.url = `/devices/coap-1/${kind}`;
    const response = {
      code: '',
      finished: false,
      setOption: jest.fn(),
      end: jest.fn(function (payload: string) {
        this.finished = true;
        this.payload = payload;
      }),
      payload: '',
    };
    const handled = service['handleRequest'](request, response);
    request.end(JSON.stringify(body));
    await handled;

    return {
      code: response.code,
      body: JSON.parse(response.payload),
    };
  };

  it('forwards CoAP telemetry and attributes to the shared plugin pipeline', async () => {
    const telemetry = { schemaId: 'modelA', telemetry: { led: false } };
    const attributes = {
      serialNumber: 'coap-1',
      firmware: '1.0.0',
      hardwareModel: 'modelA',
    };

    await expect(send('telemetry', telemetry)).resolves.toEqual({
      code: '2.04',
      body: { approved: true },
    });
    await expect(send('attributes', attributes)).resolves.toEqual({
      code: '2.04',
      body: { approved: true },
    });

    expect(pluginCore.processTelemetry).toHaveBeenCalledWith(
      telemetry,
      expect.objectContaining({ deviceId: 'coap-1', transport: 'coap' }),
    );
    expect(pluginCore.processAttributes).toHaveBeenCalledWith(
      attributes,
      expect.objectContaining({ deviceId: 'coap-1', transport: 'coap' }),
    );
  });

  it('registers and removes the command endpoint from CoAP status', async () => {
    const endpoint = 'coap://127.0.0.1:5684/commands';

    await send('status', {
      deviceId: 'coap-1',
      status: 'online',
      commandEndpoint: endpoint,
    });
    expect(registry.register).toHaveBeenCalledWith('coap-1', endpoint);
    expect(pluginCore.processStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'online' }),
      expect.objectContaining({ deviceId: 'coap-1', transport: 'coap' }),
    );

    await send('status', { deviceId: 'coap-1', status: 'offline' });
    expect(registry.unregister).toHaveBeenCalledWith('coap-1');
  });

  it('returns a validation error without bypassing the plugin decision', async () => {
    pluginCore.processTelemetry.mockResolvedValue({
      approved: false,
      reason: 'INVALID_TELEMETRY_SCHEMA',
    });
    commandService.sendCommandAndWaitForResponse.mockResolvedValue({
      success: true,
    });

    await expect(send('telemetry', { schemaId: 'wrong' })).resolves.toEqual({
      code: '4.00',
      body: {
        approved: false,
        reason: 'INVALID_TELEMETRY_SCHEMA',
      },
    });
    expect(commandService.sendCommandAndWaitForResponse).toHaveBeenCalledWith(
      'coap-1',
      'STOP_DEVICE',
      { reason: 'INVALID_TELEMETRY_SCHEMA' },
    );
  });
});
