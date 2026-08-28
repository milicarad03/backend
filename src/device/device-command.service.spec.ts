import { CoapCommandService } from '../coap/coap-command.service';
import { CoapDeviceRegistryService } from '../coap/coap-device-registry.service';
import { MqttCommandService } from '../mqtt/mqtt-command.service';
import { DeviceCommandService } from './device-command.service';

describe('DeviceCommandService', () => {
  const mqttCommandService = {
    sendCommandAndWaitForResponse: jest.fn(),
  };
  const coapCommandService = {
    sendCommandAndWaitForResponse: jest.fn(),
  };
  const coapRegistry = {
    has: jest.fn(),
    unregister: jest.fn(),
  };
  let service: DeviceCommandService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceCommandService(
      mqttCommandService as unknown as MqttCommandService,
      coapCommandService as unknown as CoapCommandService,
      coapRegistry as unknown as CoapDeviceRegistryService,
    );
  });

  it('uses MQTT when no CoAP endpoint is registered', async () => {
    coapRegistry.has.mockReturnValue(false);
    mqttCommandService.sendCommandAndWaitForResponse.mockResolvedValue({
      deviceId: 'mqtt-1',
      command: 'SET_LED',
      correlationId: 'correlation-1',
      success: true,
    });

    const result = await service.sendCommandAndWaitForResponse(
      'mqtt-1',
      'SET_LED',
      { value: true },
      2_000,
      'correlation-1',
    );

    expect(mqttCommandService.sendCommandAndWaitForResponse).toHaveBeenCalledWith(
      'mqtt-1',
      'SET_LED',
      { value: true },
      2_000,
      'correlation-1',
    );
    expect(coapCommandService.sendCommandAndWaitForResponse).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      transport: 'mqtt',
      success: true,
      transportRoundTripMs: expect.any(Number),
    });
  });

  it('uses CoAP when the device registered a CoAP command endpoint', async () => {
    coapRegistry.has.mockReturnValue(true);
    coapCommandService.sendCommandAndWaitForResponse.mockResolvedValue({
      deviceId: 'coap-1',
      command: 'SET_LED',
      correlationId: 'correlation-2',
      success: true,
    });

    const result = await service.sendCommandAndWaitForResponse(
      'coap-1',
      'SET_LED',
      { value: false },
      2_000,
      'correlation-2',
    );

    expect(coapCommandService.sendCommandAndWaitForResponse).toHaveBeenCalledWith(
      'coap-1',
      'SET_LED',
      { value: false },
      2_000,
      'correlation-2',
    );
    expect(mqttCommandService.sendCommandAndWaitForResponse).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      transport: 'coap',
      success: true,
      transportRoundTripMs: expect.any(Number),
    });
  });

  it('removes a stale CoAP route after transport failure without retrying the command', async () => {
    coapRegistry.has.mockReturnValue(true);
    coapCommandService.sendCommandAndWaitForResponse.mockRejectedValue(
      new Error('DEVICE_RESPONSE_TIMEOUT:SET_LED'),
    );

    await expect(
      service.sendCommandAndWaitForResponse(
        'coap-1',
        'SET_LED',
        { value: true },
      ),
    ).rejects.toThrow('DEVICE_RESPONSE_TIMEOUT:SET_LED');

    expect(coapRegistry.unregister).toHaveBeenCalledWith('coap-1');
    expect(mqttCommandService.sendCommandAndWaitForResponse).not.toHaveBeenCalled();
  });
});
