import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

import './coap-jest-cleanup';

jest.setTimeout(45_000);

const RUN_ID = `${process.pid}-${Date.now()}`;
const ADMIN_EMAIL = `bulk-admin-${RUN_ID}@example.com`;
const TARGET_EMAIL = `bulk-owner-${RUN_ID}@example.com`;
const MODEL_NAMES = [
  `bulkModelA-${RUN_ID}`,
  `bulkModelB-${RUN_ID}`,
  `bulkModelC-${RUN_ID}`,
];
const MODEL_VERSION = '10.0.0';
const DEVICE_IDS = [
  `bulk-e2e-${RUN_ID}-a`,
  `bulk-e2e-${RUN_ID}-b`,
  `bulk-e2e-${RUN_ID}-c`,
];

const manifest = {
  targetUserEmail: TARGET_EMAIL,
  devices: DEVICE_IDS.map((serialNumber, index) => ({
    serialNumber,
    name: `Bulk system E2E device ${index + 1}`,
    type: index === 2 ? 'pump' : 'sensor',
    model: MODEL_NAMES[index],
    version: MODEL_VERSION,
  })),
};

describe('Bulk device import with real database (system e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken = '';
  let targetUserId: number | undefined;

  const cleanDatabaseRecords = async () => {
    if (!prisma) return;

    await prisma.device.deleteMany({
      where: {
        serialNumber: {
          in: [
            ...DEVICE_IDS,
            `bulk-e2e-${RUN_ID}-missing-user`,
            `bulk-e2e-${RUN_ID}-valid-version`,
            `bulk-e2e-${RUN_ID}-missing-version`,
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: [ADMIN_EMAIL, TARGET_EMAIL] },
      },
    });
    await prisma.modelVersion.deleteMany({
      where: { modelId: { in: MODEL_NAMES } },
    });
    await prisma.deviceModel.deleteMany({
      where: { name: { in: MODEL_NAMES } },
    });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    await cleanDatabaseRecords();

    const admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: 'Bulk system E2E admin',
        password: 'not-used-by-system-e2e',
        role: 'ADMIN',
        status: 'APPROVED',
      },
    });
    const targetUser = await prisma.user.create({
      data: {
        email: TARGET_EMAIL,
        name: 'Bulk system E2E owner',
        password: 'not-used-by-system-e2e',
        role: 'USER',
        status: 'APPROVED',
      },
    });
    targetUserId = targetUser.id;

    for (const modelName of MODEL_NAMES) {
      await prisma.deviceModel.create({
        data: {
          name: modelName,
          description: 'Temporary bulk import system E2E model',
          versions: {
            create: {
              version: MODEL_VERSION,
              schema: {
                type: 'object',
                properties: {
                  schemaId: { const: modelName },
                },
              },
              mapping: {},
            },
          },
        },
      });
    }

    adminToken = moduleFixture.get(JwtService).sign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });
  });

  afterAll(async () => {
    await cleanDatabaseRecords().catch(() => undefined);
    await app?.close().catch(() => undefined);
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('creates every manifest device and persists its owner and model version', async () => {
    const response = await request(app.getHttpServer())
      .post('/device/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(manifest)
      .expect(201);

    expect(response.body).toEqual({
      total: 3,
      created: 3,
      skipped: 0,
      failed: 0,
      targetUser: {
        id: targetUserId,
        email: TARGET_EMAIL,
      },
      skippedSerialNumbers: [],
      concurrentSkips: 0,
    });

    const storedDevices = await prisma.device.findMany({
      where: { serialNumber: { in: DEVICE_IDS } },
      select: {
        serialNumber: true,
        name: true,
        type: true,
        userId: true,
        modelVersion: {
          select: { modelId: true, version: true },
        },
      },
      orderBy: { serialNumber: 'asc' },
    });

    expect(storedDevices).toHaveLength(3);
    expect(storedDevices).toEqual(
      manifest.devices
        .map((device) => ({
          serialNumber: device.serialNumber,
          name: device.name,
          type: device.type,
          userId: targetUserId,
          modelVersion: {
            modelId: device.model,
            version: device.version,
          },
        }))
        .sort((left, right) =>
          left.serialNumber.localeCompare(right.serialNumber),
        ),
    );
  });

  it('is idempotent when the same manifest is imported again', async () => {
    const response = await request(app.getHttpServer())
      .post('/device/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(manifest)
      .expect(201);

    expect(response.body).toMatchObject({
      total: 3,
      created: 0,
      skipped: 3,
      failed: 0,
      skippedSerialNumbers: [...DEVICE_IDS].sort(),
      concurrentSkips: 0,
    });
    await expect(
      prisma.device.count({
        where: { serialNumber: { in: DEVICE_IDS } },
      }),
    ).resolves.toBe(3);
  });

  it('rejects a missing target user without creating a device', async () => {
    const serialNumber = `bulk-e2e-${RUN_ID}-missing-user`;

    await request(app.getHttpServer())
      .post('/device/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetUserEmail: `missing-${RUN_ID}@example.com`,
        devices: [
          {
            ...manifest.devices[0],
            serialNumber,
          },
        ],
      })
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'TARGET_USER_NOT_FOUND',
        });
      });

    await expect(
      prisma.device.findUnique({ where: { serialNumber } }),
    ).resolves.toBeNull();
  });

  it('rejects the complete manifest when one model version is missing', async () => {
    const validSerial = `bulk-e2e-${RUN_ID}-valid-version`;
    const missingSerial = `bulk-e2e-${RUN_ID}-missing-version`;

    await request(app.getHttpServer())
      .post('/device/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetUserEmail: TARGET_EMAIL,
        devices: [
          {
            ...manifest.devices[0],
            serialNumber: validSerial,
          },
          {
            ...manifest.devices[1],
            serialNumber: missingSerial,
            version: '99.99.99',
          },
        ],
      })
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          message: 'MODEL_VERSIONS_NOT_FOUND',
          modelVersions: [`${MODEL_NAMES[1]}:99.99.99`],
        });
      });

    await expect(
      prisma.device.count({
        where: { serialNumber: { in: [validSerial, missingSerial] } },
      }),
    ).resolves.toBe(0);
  });
});
