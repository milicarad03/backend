import { Test, TestingModule } from '@nestjs/testing';
import { DevicePresenceService } from './device-presence.service';
import { DeviceTelemetryService } from './device-telemetry.service';

describe('DevicePresenceService', () => {
  let service: DevicePresenceService;
  let previousEnabled: string | undefined;
  let previousTimeout: string | undefined;
  const telemetryService = {
    markStaleDevicesOffline: jest.fn(),
  };

  beforeEach(async () => {
    previousEnabled = process.env.DEVICE_PRESENCE_ENABLED;
    previousTimeout = process.env.DEVICE_PRESENCE_TIMEOUT_MS;
    process.env.DEVICE_PRESENCE_ENABLED = 'true';
    process.env.DEVICE_PRESENCE_TIMEOUT_MS = '45000';
    telemetryService.markStaleDevicesOffline.mockReset();
    telemetryService.markStaleDevicesOffline.mockResolvedValue([
      'stale-device-1',
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicePresenceService,
        {
          provide: DeviceTelemetryService,
          useValue: telemetryService,
        },
      ],
    }).compile();

    service = module.get(DevicePresenceService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    if (previousEnabled === undefined) {
      delete process.env.DEVICE_PRESENCE_ENABLED;
    } else {
      process.env.DEVICE_PRESENCE_ENABLED = previousEnabled;
    }
    if (previousTimeout === undefined) {
      delete process.env.DEVICE_PRESENCE_TIMEOUT_MS;
    } else {
      process.env.DEVICE_PRESENCE_TIMEOUT_MS = previousTimeout;
    }
  });

  it('uses the configured timeout to expire stale ONLINE devices', async () => {
    const now = new Date('2026-09-01T12:00:00.000Z');

    await expect(service.sweepNow(now)).resolves.toEqual([
      'stale-device-1',
    ]);
    expect(
      telemetryService.markStaleDevicesOffline,
    ).toHaveBeenCalledWith(
      new Date('2026-09-01T11:59:15.000Z'),
    );
  });
});
