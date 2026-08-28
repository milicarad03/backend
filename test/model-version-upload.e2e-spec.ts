import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/jwt.strategy';
import { ModelVersionController } from '../src/model-version/model-version.controller';
import { ModelVersionRepository } from '../src/model-version/model-version.repository';
import { ModelVersionService } from '../src/model-version/model-version.service';
import { RolesGuard } from '../src/roles.guard';

const TEST_JWT_SECRET = 'model-version-upload-e2e-secret';

const validSchema = {
  type: 'object',
  required: ['schemaId'],
  commands: {
    SET_FLOW_TARGET: {
      'x-idempotency': {
        stateBinding: 'flowRate',
        payloadPath: 'target',
        maxAgeMs: 15000,
        epsilon: 0.01,
      },
      payload: {
        type: 'object',
        required: ['target'],
        properties: {
          target: { type: 'number' },
        },
      },
    },
  },
  properties: {
    schemaId: {
      type: 'string',
      const: 'smartPumpModel',
    },
    metrics: {
      type: 'object',
      properties: {
        flowRate: {
          type: 'number',
          'x-reporting': {
            ACTIVE: 5000,
            IDLE: null,
          },
        },
      },
    },
    historicalTelemetry: {
      type: 'object',
      properties: {
        flowRate: {
          type: 'array',
          'x-buffering': {
            interval: 10000,
          },
          items: {
            type: 'object',
            properties: {
              val: { type: 'number' },
            },
          },
        },
      },
    },
  },
};

const validMapping = {
  fields: {
    flowRate: {
      path: 'metrics.flowRate',
      historyPath: 'historicalTelemetry.flowRate',
      operation: 'min',
    },
  },
  dashboard: {
    sections: [
      {
        id: 'overview',
        columns: 2,
        items: [
          {
            id: 'flow-rate',
            component: 'value-card',
            bind: 'flowRate',
          },
          {
            id: 'flow-target',
            component: 'numeric-input',
            command: 'SET_FLOW_TARGET',
            commandField: 'target',
            min: 0,
            max: 500,
            step: 1,
          },
        ],
      },
    ],
  },
};

const schemaWithAttributes = {
  ...validSchema,
  properties: {
    ...validSchema.properties,
    attributes: {
      type: 'object',
      required: [
        'serialNumber',
        'firmware',
        'hardwareModel',
      ],
      properties: {
        serialNumber: { type: 'string' },
        firmware: { type: 'string' },
        hardwareModel: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
};

const mappingWithAttributes = {
  ...validMapping,
  fields: {
    ...validMapping.fields,
    serialNumber: {
      path: 'attributes.serialNumber',
    },
    firmware: {
      path: 'attributes.firmware',
    },
    hardwareModel: {
      path: 'attributes.hardwareModel',
    },
  },
  dashboard: {
    sections: [
      {
        ...validMapping.dashboard.sections[0],
        items: [
          {
            id: 'firmware',
            component: 'value-card',
            bind: 'firmware',
          },
          ...validMapping.dashboard.sections[0].items,
        ],
      },
    ],
  },
};

describe('Model version upload (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let userToken: string;
  let previousTokenSecret: string | undefined;

  const repository = {
    findOne: jest.fn(),
    upsertDeviceModel: jest.fn(),
    createVersion: jest.fn(),
  };

  const uploadValidFiles = (token: string) =>
    request(app.getHttpServer())
      .post('/model-versions/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('modelName', 'smartPumpModel')
      .field('version', '1.0.0')
      .field('description', 'Smart pump test model')
      .attach('schema', Buffer.from(JSON.stringify(validSchema)), {
        filename: 'schema.json',
        contentType: 'application/json',
      })
      .attach('mapping', Buffer.from(JSON.stringify(validMapping)), {
        filename: 'mapping.json',
        contentType: 'application/json',
      });

  beforeAll(async () => {
    previousTokenSecret = process.env.TOKEN_SECRET;
    process.env.TOKEN_SECRET = TEST_JWT_SECRET;

    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [
          PassportModule.register({ defaultStrategy: 'jwt' }),
          JwtModule.register({
            secret: TEST_JWT_SECRET,
            signOptions: { expiresIn: '1h' },
          }),
        ],
        controllers: [ModelVersionController],
        providers: [
          ModelVersionService,
          JwtStrategy,
          RolesGuard,
          {
            provide: ModelVersionRepository,
            useValue: repository,
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

    jwtService = moduleFixture.get(JwtService);
    adminToken = jwtService.sign({
      sub: 1,
      email: 'admin@example.com',
      role: 'ADMIN',
    });
    userToken = jwtService.sign({
      sub: 2,
      email: 'user@example.com',
      role: 'USER',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    repository.findOne.mockResolvedValue(null);
    repository.upsertDeviceModel.mockResolvedValue({
      name: 'smartPumpModel',
      description: 'Smart pump test model',
    });
    repository.createVersion.mockResolvedValue({
      id: 'model-version-1',
      modelId: 'smartPumpModel',
      version: '1.0.0',
      schema: validSchema,
      mapping: validMapping,
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

  it('allows an administrator to upload schema and mapping files', async () => {
    const response = await uploadValidFiles(adminToken).expect(201);

    expect(response.body).toMatchObject({
      id: 'model-version-1',
      modelId: 'smartPumpModel',
      version: '1.0.0',
      validation: { valid: true },
    });
    expect(repository.upsertDeviceModel).toHaveBeenCalledWith({
      name: 'smartPumpModel',
      description: 'Smart pump test model',
    });
    expect(repository.createVersion).toHaveBeenCalledWith({
      modelName: 'smartPumpModel',
      version: '1.0.0',
      schema: validSchema,
      mapping: validMapping,
    });
  });

  it('allows an administrator to upload a model with device attributes', async () => {
    repository.createVersion.mockResolvedValueOnce({
      id: 'model-version-with-attributes',
      modelId: 'smartPumpModel',
      version: '1.1.4',
      schema: schemaWithAttributes,
      mapping: mappingWithAttributes,
    });

    const response = await request(app.getHttpServer())
      .post('/model-versions/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('modelName', 'smartPumpModel')
      .field('version', '1.1.4')
      .field('description', 'Smart pump model with device attributes')
      .attach(
        'schema',
        Buffer.from(JSON.stringify(schemaWithAttributes)),
        {
          filename: 'schema-with-attributes.json',
          contentType: 'application/json',
        },
      )
      .attach(
        'mapping',
        Buffer.from(JSON.stringify(mappingWithAttributes)),
        {
          filename: 'mapping-with-attributes.json',
          contentType: 'application/json',
        },
      )
      .expect(201);

    expect(response.body).toMatchObject({
      id: 'model-version-with-attributes',
      modelId: 'smartPumpModel',
      version: '1.1.4',
      validation: { valid: true },
    });
    expect(repository.upsertDeviceModel).toHaveBeenCalledWith({
      name: 'smartPumpModel',
      description: 'Smart pump model with device attributes',
    });
    expect(repository.createVersion).toHaveBeenCalledWith({
      modelName: 'smartPumpModel',
      version: '1.1.4',
      schema: schemaWithAttributes,
      mapping: mappingWithAttributes,
    });
  });

  it('forbids a regular user from uploading a model version', async () => {
    await uploadValidFiles(userToken).expect(403);

    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('rejects an upload when one required file is missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/model-versions/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('modelName', 'smartPumpModel')
      .field('version', '1.0.0')
      .attach('schema', Buffer.from(JSON.stringify(validSchema)), {
        filename: 'schema.json',
        contentType: 'application/json',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'SCHEMA_AND_MAPPING_FILES_REQUIRED',
    );
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('rejects a file containing invalid JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/model-versions/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('modelName', 'smartPumpModel')
      .field('version', '1.0.0')
      .attach('schema', Buffer.from('{ invalid json'), {
        filename: 'schema.json',
        contentType: 'application/json',
      })
      .attach('mapping', Buffer.from(JSON.stringify(validMapping)), {
        filename: 'mapping.json',
        contentType: 'application/json',
      })
      .expect(400);

    expect(response.body.message).toContain('SCHEMA_INVALID_JSON');
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('rejects incompatible schema and mapping files', async () => {
    const incompatibleMapping = {
      ...validMapping,
      fields: {
        ...validMapping.fields,
        flowRate: {
          path: 'metrics.missingField',
        },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/model-versions/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('modelName', 'smartPumpModel')
      .field('version', '1.0.0')
      .attach('schema', Buffer.from(JSON.stringify(validSchema)), {
        filename: 'schema.json',
        contentType: 'application/json',
      })
      .attach('mapping', Buffer.from(JSON.stringify(incompatibleMapping)), {
        filename: 'mapping.json',
        contentType: 'application/json',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'SCHEMA_MAPPING_COMPATIBILITY_FAILED',
    );
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('MAPPING_PATH_NOT_IN_SCHEMA'),
      ]),
    );
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('rejects a dashboard that references an unknown mapping field', async () => {
    const invalidDashboardMapping = {
      ...validMapping,
      dashboard: {
        sections: [
          {
            id: 'overview',
            columns: 1,
            items: [
              {
                id: 'missing-value',
                component: 'value-card',
                bind: 'unknownField',
              },
            ],
          },
        ],
      },
    };

    const response = await request(app.getHttpServer())
      .post('/model-versions/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('modelName', 'smartPumpModel')
      .field('version', '1.0.0')
      .attach('schema', Buffer.from(JSON.stringify(validSchema)), {
        filename: 'schema.json',
        contentType: 'application/json',
      })
      .attach('mapping', Buffer.from(JSON.stringify(invalidDashboardMapping)), {
        filename: 'mapping.json',
        contentType: 'application/json',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'SCHEMA_MAPPING_COMPATIBILITY_FAILED',
    );
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DASHBOARD_BINDING_NOT_FOUND'),
      ]),
    );
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('rejects idempotency metadata that references an unknown binding', async () => {
    const invalidIdempotencySchema = {
      ...validSchema,
      commands: {
        SET_FLOW_TARGET: {
          ...validSchema.commands.SET_FLOW_TARGET,
          'x-idempotency': {
            stateBinding: 'missingBinding',
            payloadPath: 'target',
            maxAgeMs: 15000,
          },
        },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/model-versions/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('modelName', 'smartPumpModel')
      .field('version', '1.0.1')
      .attach(
        'schema',
        Buffer.from(JSON.stringify(invalidIdempotencySchema)),
        {
          filename: 'schema.json',
          contentType: 'application/json',
        },
      )
      .attach(
        'mapping',
        Buffer.from(JSON.stringify(validMapping)),
        {
          filename: 'mapping.json',
          contentType: 'application/json',
        },
      )
      .expect(400);

    expect(response.body.message).toBe(
      'SCHEMA_MAPPING_COMPATIBILITY_FAILED',
    );
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'COMMAND_IDEMPOTENCY_STATE_BINDING_NOT_FOUND',
        ),
      ]),
    );
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it('returns 409 when the model version already exists', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: 'existing-version',
      modelId: 'smartPumpModel',
      version: '1.0.0',
    });

    const response = await uploadValidFiles(adminToken).expect(409);

    expect(response.body.message).toBe('MODEL_VERSION_ALREADY_EXISTS');
    expect(repository.upsertDeviceModel).not.toHaveBeenCalled();
    expect(repository.createVersion).not.toHaveBeenCalled();
  });
});
