import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

export type AuditedDeviceCommand = {
  userId: number;
  deviceId: string;
  command: string;
  payload?: unknown;
};

export type AuditedCommandResult<T> = {
  correlationId: string;
  value: T;
};

@Injectable()
export class DeviceCommandAuditService {
  private readonly logger = new Logger(DeviceCommandAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    command: AuditedDeviceCommand,
    action: (correlationId: string) => Promise<T>,
  ): Promise<AuditedCommandResult<T>> {
    const correlationId = randomUUID();
    const audit = await this.prisma.commandAudit.create({
      data: {
        userId: command.userId,
        deviceId: command.deviceId,
        command: command.command,
        payload:
          command.payload === undefined
            ? undefined
            : (command.payload as Prisma.InputJsonValue),
        correlationId,
        result: 'PENDING',
      },
    });

    try {
      const value = await action(correlationId);
      const result = this.isNoop(value) ? 'NOOP' : 'SUCCESS';

      try {
        await this.prisma.commandAudit.update({
          where: { id: audit.id },
          data: {
            result,
            error: null,
            completedAt: new Date(),
          },
        });
      } catch (error) {
        this.logger.error(
          `Command ${correlationId} succeeded, but its audit record could not be finalized: ${this.errorMessage(error)}`,
        );
      }

      return { correlationId, value };
    } catch (error) {
      try {
        await this.prisma.commandAudit.update({
          where: { id: audit.id },
          data: {
            result: 'FAILURE',
            error: this.errorMessage(error),
            completedAt: new Date(),
          },
        });
      } catch (auditError) {
        this.logger.error(
          `Command ${correlationId} failed and its audit record could not be finalized: ${this.errorMessage(auditError)}`,
        );
      }

      throw error;
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'UNKNOWN_COMMAND_ERROR';
    }
  }

  private isNoop(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      'status' in value &&
      (value as { status?: unknown }).status === 'NOOP'
    );
  }
}
