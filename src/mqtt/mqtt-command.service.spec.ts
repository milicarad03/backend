import { MqttCommandService } from './mqtt-command.service';
import { MqttPublisherService } from './mqtt-publisher.service';

describe('MqttCommandService', () => {
  const mqttPublisher = {
    publish: jest.fn(),
  };
  let service: MqttCommandService;

  beforeEach(() => {
    jest.clearAllMocks();
    mqttPublisher.publish.mockResolvedValue(undefined);
    service = new MqttCommandService(
      mqttPublisher as unknown as MqttPublisherService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('resolves only the matching correlation response', async () => {
    const responsePromise = service.sendCommandAndWaitForResponse(
      'dev-123',
      'SET_PUMP_STATE',
      { enabled: true },
      1_000,
      'correlation-1',
    );
    await Promise.resolve();

    expect(mqttPublisher.publish).toHaveBeenCalledWith(
      'command',
      'dev-123',
      {
        command: 'SET_PUMP_STATE',
        payload: {
          enabled: true,
          correlationId: 'correlation-1',
        },
        correlationId: 'correlation-1',
      },
    );
    expect(
      service.handleResponse('dev-123', {
        deviceId: 'dev-123',
        command: 'SET_PUMP_STATE',
        correlationId: 'wrong-correlation',
        success: true,
      }),
    ).toBe(false);

    const response = {
      deviceId: 'dev-123',
      command: 'SET_PUMP_STATE',
      correlationId: 'correlation-1',
      success: true,
    };

    expect(service.handleResponse('dev-123', response)).toBe(true);
    await expect(responsePromise).resolves.toEqual(response);
    expect(service['pendingResponses'].size).toBe(0);
  });

  it('rejects on timeout and removes the pending response', async () => {
    const responsePromise = service.sendCommandAndWaitForResponse(
      'dev-123',
      'SET_FLOW_TARGET',
      { target: 100 },
      20,
      'correlation-timeout',
    );

    await expect(responsePromise).rejects.toThrow(
      'DEVICE_RESPONSE_TIMEOUT:SET_FLOW_TARGET',
    );
    expect(service['pendingResponses'].size).toBe(0);
  });

  it('cleans the timer when publishing fails', async () => {
    mqttPublisher.publish.mockRejectedValueOnce(
      new Error('MQTT_PUBLISH_FAILED'),
    );
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    await expect(
      service.sendCommandAndWaitForResponse(
        'dev-123',
        'SET_STATE',
        { state: 'ACTIVE' },
        1_000,
        'correlation-failed-publish',
      ),
    ).rejects.toThrow('MQTT_PUBLISH_FAILED');

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(service['pendingResponses'].size).toBe(0);
    clearTimeoutSpy.mockRestore();
  });

  it('rejects every pending command during shutdown', async () => {
    const responsePromise = service.sendCommandAndWaitForResponse(
      'dev-123',
      'SET_STATE',
      { state: 'ACTIVE' },
      10_000,
      'correlation-shutdown',
    );
    const rejection = expect(responsePromise).rejects.toThrow(
      'MQTT_COMMAND_SERVICE_SHUTDOWN:dev-123:SET_STATE:correlation-shutdown',
    );

    await Promise.resolve();
    service.onModuleDestroy();

    await rejection;
    expect(service['pendingResponses'].size).toBe(0);
  });
});
