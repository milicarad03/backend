import {
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DeviceDashboardService } from 'serverplugin';
import { DeviceController } from '../src/device/device.controller';
import { DeviceCommandAuditService } from '../src/device/device-command-audit.service';
import { DeviceBulkImportService } from '../src/device/device-bulk-import.service';
import { DeviceService } from '../src/device/device.service';
import { DeviceTelemetryService } from '../src/device/device-telemetry.service';
import { JwtStrategy } from '../src/jwt.strategy';
import { MqttTransportService } from '../src/mqtt/mqtt-transport.service';
import { RolesGuard } from '../src/roles.guard';
import { UsersController } from '../src/users/users.controller';
import { UsersRepository } from '../src/users/users.repository';
import { UsersService } from '../src/users/users.service';

const TEST_JWT_SECRET = 'backend-e2e-secret';

describe('Authentication and device authorization (e2e)', () => {
  let app: INestApplication;
  let previousTokenSecret: string | undefined;

  const usersRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const deviceService = {
    findDevices: jest.fn(),
    createDevice: jest.fn(),
    assertDeviceAccess: jest.fn(),
    getDeviceAttributes: jest.fn(),
  };

  const deviceTelemetryService = {
    getLatestTelemetry: jest.fn(),
    getTelemetryHistory: jest.fn(),
  };

  const mqttTransportService = {};

  const deviceDashboardService = {
    executeCommand: jest.fn(),
    getCommandMetadata: jest.fn(),
  };

  const deviceCommandAuditService = {
    execute: jest.fn(
      async (
        _command: unknown,
        action: (correlationId: string) => Promise<unknown>,
      ) => ({
        correlationId: 'audit-correlation-1',
        value: await action('audit-correlation-1'),
      }),
    ),
  };

  const deviceBulkImportService = {
    importDevices: jest.fn(),
  };

  const login = async (email: string, password: string) => {
    const response = await request(app.getHttpServer())
      .post('/users/login')
      .send({ email, password })
      .expect(201);

    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    previousTokenSecret = process.env.TOKEN_SECRET;
    process.env.TOKEN_SECRET = TEST_JWT_SECRET;

    const passwordHashes = {
      admin: await bcrypt.hash('admin-password', 4),
      user: await bcrypt.hash('user-password', 4),
      otherUser: await bcrypt.hash('other-user-password', 4),
    };

    const users = [
      {
        id: 1,
        name: 'Admin',
        email: 'admin@example.com',
        password: passwordHashes.admin,
        role: 'ADMIN',
        status: 'APPROVED',
      },
      {
        id: 2,
        name: 'User',
        email: 'user@example.com',
        password: passwordHashes.user,
        role: 'USER',
        status: 'APPROVED',
      },
      {
        id: 3,
        name: 'Other User',
        email: 'other-user@example.com',
        password: passwordHashes.otherUser,
        role: 'USER',
        status: 'APPROVED',
      },
    ];

    usersRepository.findOne.mockImplementation(
      async (where: { email?: string; id?: number }) =>
        users.find(
          (user) =>
            (where.email !== undefined &&
              user.email === where.email) ||
            (where.id !== undefined && user.id === where.id),
        ) ?? null,
    );

    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [
          PassportModule.register({ defaultStrategy: 'jwt' }),
          JwtModule.register({
            secret: TEST_JWT_SECRET,
            signOptions: { expiresIn: '1h' },
          }),
        ],
        controllers: [UsersController, DeviceController],
        providers: [
          UsersService,
          JwtStrategy,
          RolesGuard,
          {
            provide: UsersRepository,
            useValue: usersRepository,
          },
          {
            provide: DeviceService,
            useValue: deviceService,
          },
          {
            provide: DeviceTelemetryService,
            useValue: deviceTelemetryService,
          },
          {
            provide: MqttTransportService,
            useValue: mqttTransportService,
          },
          {
            provide: DeviceDashboardService,
            useValue: deviceDashboardService,
          },
          {
            provide: DeviceCommandAuditService,
            useValue: deviceCommandAuditService,
          },
          {
            provide: DeviceBulkImportService,
            useValue: deviceBulkImportService,
          },
        ],
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
  });

  beforeEach(() => {
    jest.clearAllMocks();

    deviceService.findDevices.mockResolvedValue({
      data: [
        {
          id: 'device-1',
          serialNumber: 'SN-1',
          name: 'Temperature sensor',
          type: 'sensor',
          status: 'ONLINE',
          userId: 2,
        },
      ],
    });

    deviceService.createDevice.mockImplementation(
      async (adminId: number, deviceData: Record<string, unknown>) => ({
        id: 'device-created',
        ...deviceData,
        registeredBy: adminId,
      }),
    );

    deviceService.assertDeviceAccess.mockImplementation(
      async (serialNumber: string, userId: number, role: string) => {
        if (serialNumber === 'SN-MISSING') {
          throw new NotFoundException('Device not found');
        }

        const device = {
          id: 'device-1',
          serialNumber: 'SN-1',
          userId: 2,
        };

        if (role !== 'ADMIN' && device.userId !== userId) {
          throw new ForbiddenException(
            'Permission denied for accessing device',
          );
        }

        return device;
      },
    );

    deviceService.getDeviceAttributes.mockImplementation(
      async (serialNumber: string, userId: number, role: string) => {
        await deviceService.assertDeviceAccess(
          serialNumber,
          userId,
          role,
        );

        return {
          serialNumber,
          attributes: {
            serialNumber,
            firmware: '1.1.4',
            hardwareModel: 'modelC',
          },
        };
      },
    );

    deviceTelemetryService.getLatestTelemetry.mockResolvedValue({
      deviceId: 'SN-1',
      data: { temperature: 21.5 },
    });

    deviceDashboardService.executeCommand.mockResolvedValue({
      status: 'DISPATCHED',
    });
    deviceBulkImportService.importDevices.mockResolvedValue({
      total: 2,
      created: 2,
      skipped: 0,
      failed: 0,
      targetUser: { id: 2, email: 'user@example.com' },
      skippedSerialNumbers: [],
      concurrentSkips: 0,
    });
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      if (previousTokenSecret === undefined) {
        delete process.env.TOKEN_SECRET;
      } else {
        process.env.TOKEN_SECRET = previousTokenSecret;
      }
    }
  });

  it('logs in and resolves the authenticated profile from a real JWT', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/users/login')
      .send({
        email: 'admin@example.com',
        password: 'admin-password',
      })
      .expect(201);

    expect(loginResponse.body.accessToken).toEqual(
      expect.any(String),
    );
    expect(loginResponse.body.user).toMatchObject({
      id: 1,
      email: 'admin@example.com',
      role: 'ADMIN',
      status: 'APPROVED',
    });
    expect(loginResponse.body.user.password).toBeUndefined();

    await request(app.getHttpServer())
      .get('/users/profile')
      .set(
        'Authorization',
        `Bearer ${loginResponse.body.accessToken}`,
      )
      .expect(200)
      .expect({
        userId: 1,
        id: 1,
        email: 'admin@example.com',
        role: 'ADMIN',
      });
  });

  it('rejects invalid login credentials', async () => {
    await request(app.getHttpServer())
      .post('/users/login')
      .send({
        email: 'admin@example.com',
        password: 'wrong-password',
      })
      .expect(401);
  });

  it('rejects user approval without a JWT', async () => {
    await request(app.getHttpServer())
      .patch('/users/approval/2')
      .send({ status: 'APPROVED' })
      .expect(401);

    expect(usersRepository.update).not.toHaveBeenCalled();
  });

  it('forbids a regular user from changing user approval', async () => {
    const userToken = await login(
      'user@example.com',
      'user-password',
    );

    await request(app.getHttpServer())
      .patch('/users/approval/2')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'APPROVED' })
      .expect(403);

    expect(usersRepository.update).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'allows an administrator to set user status to %s',
    async (status) => {
      const adminToken = await login(
        'admin@example.com',
        'admin-password',
      );

      usersRepository.update.mockResolvedValueOnce({
        id: 2,
        email: 'user@example.com',
        role: 'USER',
        status,
      });

      const response = await request(app.getHttpServer())
        .patch('/users/approval/2')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 2,
        status,
      });
      expect(usersRepository.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { status },
      });
    },
  );

  it('rejects device access without a JWT', async () => {
    await request(app.getHttpServer()).get('/device').expect(401);

    expect(deviceService.findDevices).not.toHaveBeenCalled();
  });

  it('allows a device owner to read latest telemetry', async () => {
    const ownerToken = await login(
      'user@example.com',
      'user-password',
    );

    await request(app.getHttpServer())
      .get('/device/SN-1/telemetry/latest')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect({
        deviceId: 'SN-1',
        data: { temperature: 21.5 },
      });

    expect(deviceService.assertDeviceAccess).toHaveBeenCalledWith(
      'SN-1',
      2,
      'USER',
    );
    expect(
      deviceTelemetryService.getLatestTelemetry,
    ).toHaveBeenCalledWith('SN-1');
  });

  it('forbids a regular user from reading another user telemetry', async () => {
    const otherUserToken = await login(
      'other-user@example.com',
      'other-user-password',
    );

    await request(app.getHttpServer())
      .get('/device/SN-1/telemetry/latest')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .expect(403);

    expect(
      deviceTelemetryService.getLatestTelemetry,
    ).not.toHaveBeenCalled();
  });

  it('forbids a regular user from sending a command to another user device', async () => {
    const otherUserToken = await login(
      'other-user@example.com',
      'other-user-password',
    );

    await request(app.getHttpServer())
      .post('/device/SN-1/command')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({
        command: 'SET_STATE',
        payload: { state: 'ACTIVE' },
      })
      .expect(403);

    expect(
      deviceDashboardService.executeCommand,
    ).not.toHaveBeenCalled();
    expect(deviceCommandAuditService.execute).toHaveBeenCalledWith(
      {
        userId: 3,
        deviceId: 'SN-1',
        command: 'SET_STATE',
        payload: { state: 'ACTIVE' },
      },
      expect.any(Function),
    );
  });

  it('audits an owner command and returns its correlation ID', async () => {
    const ownerToken = await login(
      'user@example.com',
      'user-password',
    );

    const response = await request(app.getHttpServer())
      .post('/device/SN-1/command')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        command: 'SET_STATE',
        payload: { state: 'ACTIVE' },
      })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      correlationId: 'audit-correlation-1',
      status: 'DISPATCHED',
    });
    expect(deviceService.assertDeviceAccess).toHaveBeenCalledWith(
      'SN-1',
      2,
      'USER',
    );
    expect(deviceDashboardService.executeCommand).toHaveBeenCalledWith(
      'SN-1',
      'SET_STATE',
      { state: 'ACTIVE' },
      { correlationId: 'audit-correlation-1' },
    );
  });

  it('allows an administrator to read another user telemetry', async () => {
    const adminToken = await login(
      'admin@example.com',
      'admin-password',
    );

    await request(app.getHttpServer())
      .get('/device/SN-1/telemetry/latest')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(deviceService.assertDeviceAccess).toHaveBeenCalledWith(
      'SN-1',
      1,
      'ADMIN',
    );
    expect(
      deviceTelemetryService.getLatestTelemetry,
    ).toHaveBeenCalledWith('SN-1');
  });

  it('returns 404 when the requested device does not exist', async () => {
    const adminToken = await login(
      'admin@example.com',
      'admin-password',
    );

    await request(app.getHttpServer())
      .get('/device/SN-MISSING/telemetry/latest')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(
      deviceTelemetryService.getLatestTelemetry,
    ).not.toHaveBeenCalled();
  });

  it('rejects device attributes access without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/device/SN-1/attributes')
      .expect(401);

    expect(deviceService.getDeviceAttributes).not.toHaveBeenCalled();
  });

  it('allows a device owner to read their device attributes', async () => {
    const ownerToken = await login(
      'user@example.com',
      'user-password',
    );

    await request(app.getHttpServer())
      .get('/device/SN-1/attributes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect({
        serialNumber: 'SN-1',
        attributes: {
          serialNumber: 'SN-1',
          firmware: '1.1.4',
          hardwareModel: 'modelC',
        },
      });

    expect(deviceService.getDeviceAttributes).toHaveBeenCalledWith(
      'SN-1',
      2,
      'USER',
    );
  });

  it('forbids a regular user from reading another device attributes', async () => {
    const otherUserToken = await login(
      'other-user@example.com',
      'other-user-password',
    );

    await request(app.getHttpServer())
      .get('/device/SN-1/attributes')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .expect(403);

    expect(deviceService.getDeviceAttributes).toHaveBeenCalledWith(
      'SN-1',
      3,
      'USER',
    );
  });

  it('allows an administrator to read device attributes', async () => {
    const adminToken = await login(
      'admin@example.com',
      'admin-password',
    );

    await request(app.getHttpServer())
      .get('/device/SN-1/attributes')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(deviceService.getDeviceAttributes).toHaveBeenCalledWith(
      'SN-1',
      1,
      'ADMIN',
    );
  });

  it('returns 404 for attributes of a device that does not exist', async () => {
    const adminToken = await login(
      'admin@example.com',
      'admin-password',
    );

    await request(app.getHttpServer())
      .get('/device/SN-MISSING/attributes')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(deviceService.getDeviceAttributes).toHaveBeenCalledWith(
      'SN-MISSING',
      1,
      'ADMIN',
    );
  });

  it('allows a regular user to fetch permitted devices', async () => {
    const userToken = await login(
      'user@example.com',
      'user-password',
    );

    const response = await request(app.getHttpServer())
      .get('/device')
      .query({
        status: 'ONLINE',
        type: 'sensor',
        userId: '2',
      })
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(deviceService.findDevices).toHaveBeenCalledWith(
      2,
      'USER',
      {
        status: 'ONLINE',
        type: ['sensor'],
        userIds: ['2'],
      },
    );
  });

  it('forbids a regular user from registering a device', async () => {
    const userToken = await login(
      'user@example.com',
      'user-password',
    );

    await request(app.getHttpServer())
      .post('/device')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        serialNumber: 'SN-NEW',
        name: 'New device',
        type: 'sensor',
        modelVersionId: 'model-version-1',
      })
      .expect(403);

    expect(deviceService.createDevice).not.toHaveBeenCalled();
  });

  it('allows an administrator to register a valid device', async () => {
    const adminToken = await login(
      'admin@example.com',
      'admin-password',
    );

    const deviceData = {
      serialNumber: 'SN-NEW',
      name: 'New device',
      type: 'sensor',
      targetUserId: 2,
      modelVersionId: 'model-version-1',
    };

    const response = await request(app.getHttpServer())
      .post('/device')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(deviceData)
      .expect(201);

    expect(response.body).toMatchObject({
      id: 'device-created',
      registeredBy: 1,
      ...deviceData,
    });
    expect(deviceService.createDevice).toHaveBeenCalledWith(
      1,
      deviceData,
    );
  });

  it('rejects invalid device data before calling the service', async () => {
    const adminToken = await login(
      'admin@example.com',
      'admin-password',
    );

    await request(app.getHttpServer())
      .post('/device')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        serialNumber: 'SN-WITHOUT-MODEL',
      })
      .expect(400);

    expect(deviceService.createDevice).not.toHaveBeenCalled();
  });

  it('forbids a regular user from bulk importing devices', async () => {
    const userToken = await login(
      'user@example.com',
      'user-password',
    );

    await request(app.getHttpServer())
      .post('/device/bulk-import')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        targetUserEmail: 'user@example.com',
        devices: [
          {
            serialNumber: 'fleet-a-001',
            name: 'Fleet sensor 001',
            type: 'sensor',
            model: 'modelA',
            version: '10.0.0',
          },
        ],
      })
      .expect(403);

    expect(deviceBulkImportService.importDevices).not.toHaveBeenCalled();
  });

  it('allows an administrator to bulk import a valid manifest', async () => {
    const adminToken = await login(
      'admin@example.com',
      'admin-password',
    );
    const manifest = {
      targetUserEmail: 'user@example.com',
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

    const response = await request(app.getHttpServer())
      .post('/device/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(manifest)
      .expect(201);

    expect(response.body).toMatchObject({
      total: 2,
      created: 2,
      skipped: 0,
      failed: 0,
    });
    expect(deviceBulkImportService.importDevices).toHaveBeenCalledWith(
      manifest,
    );
  });
});
