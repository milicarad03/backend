import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DeviceBulkImportService } from './device-bulk-import.service';

describe('DeviceBulkImportService', () => {
  const transaction = {
    user: { findUnique: jest.fn() },
    modelVersion: { findMany: jest.fn() },
    device: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => unknown) =>
        operation(transaction),
    ),
  };
  const service = new DeviceBulkImportService(prisma as never);
  const manifest = {
    targetUserEmail: 'owner@example.com',
    devices: [
      {
        serialNumber: 'fleet-a-001',
        name: 'Fleet sensor 001',
        type: 'sensor',
        model: 'modelA',
        version: '10.0.0',
      },
      {
        serialNumber: 'fleet-b-001',
        name: 'Fleet compressor 001',
        type: 'compressor',
        model: 'modelB',
        version: '10.0.0',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'owner@example.com',
    });
    transaction.modelVersion.findMany.mockResolvedValue([
      { id: 'mv-a', modelId: 'modelA', version: '10.0.0' },
      { id: 'mv-b', modelId: 'modelB', version: '10.0.0' },
    ]);
    transaction.device.findMany.mockResolvedValue([
      { serialNumber: 'fleet-a-001' },
    ]);
    transaction.device.createMany.mockResolvedValue({ count: 1 });
  });

  it('creates only devices whose serial numbers are not already present', async () => {
    await expect(service.importDevices(manifest)).resolves.toEqual({
      total: 2,
      created: 1,
      skipped: 1,
      failed: 0,
      targetUser: { id: 7, email: 'owner@example.com' },
      skippedSerialNumbers: ['fleet-a-001'],
      concurrentSkips: 0,
    });

    expect(transaction.device.createMany).toHaveBeenCalledWith({
      data: [
        {
          serialNumber: 'fleet-b-001',
          name: 'Fleet compressor 001',
          type: 'compressor',
          userId: 7,
          modelVersionId: 'mv-b',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('rejects duplicate serial numbers before opening a transaction', async () => {
    const duplicateManifest = {
      ...manifest,
      devices: [manifest.devices[0], { ...manifest.devices[0] }],
    };

    await expect(
      service.importDevices(duplicateManifest),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects the whole import when a requested model version is missing', async () => {
    transaction.modelVersion.findMany.mockResolvedValue([
      { id: 'mv-a', modelId: 'modelA', version: '10.0.0' },
    ]);

    await expect(service.importDevices(manifest)).rejects.toMatchObject({
      response: {
        message: 'MODEL_VERSIONS_NOT_FOUND',
        modelVersions: ['modelB:10.0.0'],
      },
    });
    expect(transaction.device.createMany).not.toHaveBeenCalled();
  });

  it('rejects the whole import when the target user does not exist', async () => {
    transaction.user.findUnique.mockResolvedValue(null);

    await expect(service.importDevices(manifest)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transaction.modelVersion.findMany).not.toHaveBeenCalled();
    expect(transaction.device.createMany).not.toHaveBeenCalled();
  });
});
