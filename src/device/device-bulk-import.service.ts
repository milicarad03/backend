import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { BulkDeviceImportDto } from './dto/bulk-device-import.dto';
import type {
  BulkDeviceDefinition,
  BulkDeviceRepositoryResult,
} from './device-bulk-import.types';

@Injectable()
export class DeviceBulkImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importDevices(manifest: BulkDeviceImportDto) {
    const duplicateSerialNumbers = this.findDuplicateSerialNumbers(
      manifest.devices,
    );

    if (duplicateSerialNumbers.length > 0) {
      throw new BadRequestException({
        message: 'DUPLICATE_SERIAL_NUMBERS_IN_MANIFEST',
        duplicateSerialNumbers,
      });
    }

    const result = await this.persistDevices(
      manifest.targetUserEmail,
      manifest.devices,
    );

    if (!result.targetUser) {
      throw new NotFoundException({
        message: 'TARGET_USER_NOT_FOUND',
        targetUserEmail: manifest.targetUserEmail,
      });
    }

    if (result.missingModelVersions.length > 0) {
      throw new NotFoundException({
        message: 'MODEL_VERSIONS_NOT_FOUND',
        modelVersions: result.missingModelVersions,
      });
    }

    const concurrentSkips = result.attemptedCreates - result.created;

    return {
      total: manifest.devices.length,
      created: result.created,
      skipped:
        result.existingSerialNumbers.length + concurrentSkips,
      failed: 0,
      targetUser: result.targetUser,
      skippedSerialNumbers: result.existingSerialNumbers,
      concurrentSkips,
    };
  }

  private async persistDevices(
    targetUserEmail: string,
    devices: BulkDeviceDefinition[],
  ): Promise<BulkDeviceRepositoryResult> {
    return this.prisma.$transaction(async (transaction) => {
      const targetUser = await transaction.user.findUnique({
        where: { email: targetUserEmail },
        select: { id: true, email: true },
      });

      if (!targetUser) {
        return {
          targetUser: null,
          missingModelVersions: [],
          existingSerialNumbers: [],
          attemptedCreates: 0,
          created: 0,
        };
      }

      const requestedModelVersions = Array.from(
        new Map(
          devices.map((device) => [
            `${device.model}\u0000${device.version}`,
            { model: device.model, version: device.version },
          ]),
        ).values(),
      );
      const modelVersions = await transaction.modelVersion.findMany({
        where: {
          OR: requestedModelVersions.map(({ model, version }) => ({
            modelId: model,
            version,
          })),
        },
        select: { id: true, modelId: true, version: true },
      });
      const modelVersionIds = new Map(
        modelVersions.map((modelVersion) => [
          `${modelVersion.modelId}\u0000${modelVersion.version}`,
          modelVersion.id,
        ]),
      );
      const missingModelVersions = requestedModelVersions
        .filter(
          ({ model, version }) =>
            !modelVersionIds.has(`${model}\u0000${version}`),
        )
        .map(({ model, version }) => `${model}:${version}`)
        .sort();

      if (missingModelVersions.length > 0) {
        return {
          targetUser,
          missingModelVersions,
          existingSerialNumbers: [],
          attemptedCreates: 0,
          created: 0,
        };
      }

      const existingDevices = await transaction.device.findMany({
        where: {
          serialNumber: {
            in: devices.map((device) => device.serialNumber),
          },
        },
        select: { serialNumber: true },
      });
      const existingSerialNumbers = existingDevices
        .map((device) => device.serialNumber)
        .sort();
      const existingSerialNumberSet = new Set(existingSerialNumbers);
      const devicesToCreate = devices.filter(
        (device) => !existingSerialNumberSet.has(device.serialNumber),
      );
      const createResult = await transaction.device.createMany({
        data: devicesToCreate.map((device) => ({
          serialNumber: device.serialNumber,
          name: device.name,
          type: device.type,
          userId: targetUser.id,
          modelVersionId: modelVersionIds.get(
            `${device.model}\u0000${device.version}`,
          )!,
        })),
        skipDuplicates: true,
      });

      return {
        targetUser,
        missingModelVersions: [],
        existingSerialNumbers,
        attemptedCreates: devicesToCreate.length,
        created: createResult.count,
      };
    });
  }

  private findDuplicateSerialNumbers(
    devices: BulkDeviceDefinition[],
  ): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const device of devices) {
      if (seen.has(device.serialNumber)) {
        duplicates.add(device.serialNumber);
      }
      seen.add(device.serialNumber);
    }

    return [...duplicates].sort();
  }
}
