import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DeviceTelemetryService } from './device-telemetry.service';

const DEFAULT_PRESENCE_TIMEOUT_MS = 45_000;
const DEFAULT_PRESENCE_SWEEP_INTERVAL_MS = 10_000;

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class DevicePresenceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DevicePresenceService.name);
  private readonly enabled =
    process.env.DEVICE_PRESENCE_ENABLED !== 'false';
  private readonly timeoutMs = readPositiveInteger(
    process.env.DEVICE_PRESENCE_TIMEOUT_MS,
    DEFAULT_PRESENCE_TIMEOUT_MS,
  );
  private readonly sweepIntervalMs = readPositiveInteger(
    process.env.DEVICE_PRESENCE_SWEEP_INTERVAL_MS,
    DEFAULT_PRESENCE_SWEEP_INTERVAL_MS,
  );
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweepInProgress = false;

  constructor(
    private readonly telemetryService: DeviceTelemetryService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Device presence monitoring is disabled.');
      return;
    }

    await this.sweepNow();
    this.sweepTimer = setInterval(() => {
      void this.sweepNow();
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();

    this.logger.log(
      `Device presence monitoring active: timeout=${this.timeoutMs}ms, sweep=${this.sweepIntervalMs}ms.`,
    );
  }

  onModuleDestroy(): void {
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  async sweepNow(now = new Date()): Promise<string[]> {
    if (!this.enabled || this.sweepInProgress) return [];

    this.sweepInProgress = true;
    const cutoff = new Date(now.getTime() - this.timeoutMs);

    try {
      return await this.telemetryService.markStaleDevicesOffline(cutoff);
    } catch (error: any) {
      this.logger.error(
        `Device presence sweep failed: ${error.message}`,
        error.stack,
      );
      return [];
    } finally {
      this.sweepInProgress = false;
    }
  }
}
