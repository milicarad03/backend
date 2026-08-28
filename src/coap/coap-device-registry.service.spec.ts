import { CoapDeviceRegistryService } from './coap-device-registry.service';

describe('CoapDeviceRegistryService', () => {
  let registry: CoapDeviceRegistryService;

  beforeEach(() => {
    registry = new CoapDeviceRegistryService();
  });

  it('normalizes and stores a CoAP command endpoint', () => {
    const registration = registry.register(
      ' device-1 ',
      'coap://127.0.0.1:5684/custom?ignored=true',
    );

    expect(registration).toMatchObject({
      deviceId: 'device-1',
      commandEndpoint: 'coap://127.0.0.1:5684/commands',
      registeredAt: expect.any(String),
    });
    expect(registry.has('device-1')).toBe(true);
  });

  it('rejects non-CoAP and incomplete endpoints', () => {
    expect(() =>
      registry.register('device-1', 'http://127.0.0.1:5684/commands'),
    ).toThrow('COAP_COMMAND_ENDPOINT_PROTOCOL_INVALID');
    expect(() =>
      registry.register('device-1', 'coap://127.0.0.1/commands'),
    ).toThrow('COAP_COMMAND_ENDPOINT_INCOMPLETE');
  });

  it('removes registrations on offline status or shutdown', () => {
    registry.register('device-1', 'coap://127.0.0.1:5684/commands');
    expect(registry.unregister('device-1')).toBe(true);

    registry.register('device-2', 'coap://127.0.0.1:5685/commands');
    registry.clear();
    expect(registry.has('device-2')).toBe(false);
  });
});
