import { EventEmitter } from 'node:events';
import { CoapCommandService } from './coap-command.service';
import { CoapDeviceRegistryService } from './coap-device-registry.service';

jest.mock('coap', () => ({ request: jest.fn() }));

const coap = require('coap') as { request: jest.Mock };

describe('CoapCommandService', () => {
  let registry: CoapDeviceRegistryService;
  let service: CoapCommandService;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new CoapDeviceRegistryService();
    registry.register('coap-1', 'coap://127.0.0.1:5684/commands');
    service = new CoapCommandService(registry);
  });

  const mockExchange = (
    responseBody: Record<string, unknown>,
    responseCode = '2.05',
  ) => {
    const request = new EventEmitter() as EventEmitter & {
      setOption: jest.Mock;
      abort: jest.Mock;
      end: jest.Mock;
    };
    request.setOption = jest.fn();
    request.abort = jest.fn();
    request.end = jest.fn(() => {
      queueMicrotask(() => {
        const response = new EventEmitter() as EventEmitter & {
          code: string;
        };
        response.code = responseCode;
        request.emit('response', response);
        queueMicrotask(() => {
          response.emit('data', Buffer.from(JSON.stringify(responseBody)));
          response.emit('end');
        });
      });
    });
    coap.request.mockReturnValue(request);
    return request;
  };

  it('sends the shared command envelope and accepts its matching response', async () => {
    const correlationId = 'correlation-1';
    const request = mockExchange({
      deviceId: 'coap-1',
      command: 'SET_LED',
      correlationId,
      success: true,
    });

    await expect(
      service.sendCommandAndWaitForResponse(
        'coap-1',
        'SET_LED',
        { value: true },
        2_000,
        correlationId,
      ),
    ).resolves.toEqual({
      deviceId: 'coap-1',
      command: 'SET_LED',
      correlationId,
      success: true,
    });

    expect(coap.request).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: '127.0.0.1',
        port: 5684,
        pathname: '/commands',
        method: 'POST',
      }),
    );
    expect(
      JSON.parse(request.end.mock.calls[0][0].toString('utf8')),
    ).toEqual({
      command: 'SET_LED',
      payload: { value: true, correlationId },
      correlationId,
    });
    expect(request.setOption).not.toHaveBeenCalledWith(
      'Block1',
      expect.any(Buffer),
    );
  });

  it('uses Block1 transfer for a model package larger than one CoAP block', async () => {
    const correlationId = 'large-model-correlation';
    const request = mockExchange({
      deviceId: 'coap-1',
      command: 'STAGE_MODEL_VERSION',
      correlationId,
      success: true,
    });
    const payload = {
      model: 'modelC',
      version: '1.1.5',
      schema: {
        description: 'x'.repeat(5_600),
      },
      mapping: {
        fields: {},
      },
    };

    await expect(
      service.sendCommandAndWaitForResponse(
        'coap-1',
        'STAGE_MODEL_VERSION',
        payload,
        2_000,
        correlationId,
      ),
    ).resolves.toMatchObject({
      deviceId: 'coap-1',
      command: 'STAGE_MODEL_VERSION',
      correlationId,
      success: true,
    });

    const requestBody = request.end.mock.calls[0][0] as Buffer;

    expect(requestBody).toBeInstanceOf(Buffer);
    expect(requestBody.length).toBeGreaterThan(1_024);
    expect(request.setOption).toHaveBeenCalledWith(
      'Block1',
      Buffer.from([6]),
    );
    expect(JSON.parse(requestBody.toString('utf8'))).toMatchObject({
      command: 'STAGE_MODEL_VERSION',
      payload: {
        model: 'modelC',
        version: '1.1.5',
        correlationId,
      },
      correlationId,
    });
  });

  it('rejects a response whose identity or correlation ID does not match', async () => {
    mockExchange({
      deviceId: 'another-device',
      command: 'SET_LED',
      correlationId: 'wrong-correlation',
      success: true,
    });

    await expect(
      service.sendCommandAndWaitForResponse(
        'coap-1',
        'SET_LED',
        { value: false },
        2_000,
        'correlation-2',
      ),
    ).rejects.toThrow('COAP_COMMAND_RESPONSE_MISMATCH');
  });
});
