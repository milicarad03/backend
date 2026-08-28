import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import mqtt from 'mqtt';
import type Redis from 'ioredis';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { MqttPublisherService } from '../src/mqtt/mqtt-publisher.service';
import { MqttTransportService } from '../src/mqtt/mqtt-transport.service';
import { PrismaService } from '../src/prisma.service';

import './coap-jest-cleanup';

jest.setTimeout(60_000);

const DEVICE_ID = `system-e2e-${process.pid}-${Date.now()}`;
const TEST_USER_EMAIL =
  `system-e2e-${process.pid}-${Date.now()}@example.test`;
const MODEL_ID = 'modelC';
const MODEL_VERSION = '1.1.3';

const MQTT_BROKER_URL =
  process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';

const backendDirectory = process.cwd();

const simulatorDirectory = resolve(
  process.cwd(),
  '../../devicesimulator',
);

const schemaPath = join(
  simulatorDirectory,
  'schema',
  MODEL_ID,
  `${MODEL_VERSION}.schema.json`,
);

const mappingPath = resolve(
  backendDirectory,
  'schema/modelSmart/mapper.json',
);

const simulatorStatsPath = join(
  tmpdir(),
  `${DEVICE_ID}-telemetry.log`,
);

const simulatorErrorPath = join(
  tmpdir(),
  `${DEVICE_ID}-error.log`,
);

type TelemetryEvent = {
  deviceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

const delay = (milliseconds: number) =>
  new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );

const waitForCondition = async (
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  errorMessage: string,
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }

    await delay(50);
  }

  throw new Error(errorMessage);
};

const waitForSocketEvent = <T>(
  socket: Socket,
  event: string,
  timeoutMs = 20_000,
) =>
  new Promise<T>((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handleEvent);
      reject(
        new Error(
          `Timed out waiting for Socket.IO event: ${event}`,
        ),
      );
    }, timeoutMs);

    const handleEvent = (payload: T) => {
      clearTimeout(timeout);
      resolvePromise(payload);
    };

    socket.once(event, handleEvent);
  });

const closeChildProcess = async (
  child: ChildProcess | undefined,
) => {
  if (
    !child ||
    child.exitCode !== null ||
    child.signalCode !== null
  ) {
    return;
  }

  child.kill('SIGINT');

  try {
    await waitForCondition(
      () =>
        child.exitCode !== null ||
        child.signalCode !== null,
      3_000,
      'Simulator did not stop after SIGINT.',
    );
  } catch {
    child.kill('SIGKILL');

    await waitForCondition(
      () =>
        child.exitCode !== null ||
        child.signalCode !== null,
      3_000,
      'Simulator did not stop after SIGKILL.',
    );
  }
};

const clearRetainedMessages = () =>
  new Promise<void>((resolvePromise) => {
    const client = mqtt.connect(MQTT_BROKER_URL, {
      clientId:
        `system-e2e-cleanup-${process.pid}-${Date.now()}`,
      connectTimeout: 2_000,
      reconnectPeriod: 0,
    });

    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      client.removeAllListeners();
      client.end(true);
      resolvePromise();
    };

    const timeout = setTimeout(finish, 3_000);

    client.once('error', () => {
      clearTimeout(timeout);
      finish();
    });

    client.once('connect', () => {
      client.publish(
        `iot/devices/${DEVICE_ID}/status`,
        '',
        {
          qos: 1,
          retain: true,
        },
        () => {
          client.publish(
            `iot/devices/${DEVICE_ID}/attributes`,
            '',
            {
              qos: 1,
              retain: true,
            },
            () => {
              clearTimeout(timeout);
              finish();
            },
          );
        },
      );
    });
  });

describe(
  'Simulator to backend telemetry pipeline (system e2e)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let socket: Socket | undefined;
    let simulatorProcess: ChildProcess | undefined;
    let simulatorOutput = '';
    let modelVersionId: string | undefined;
    let userId: number | undefined;
    let baseUrl = '';
    let ownerToken = '';

    const removeTemporarySimulatorFiles = () => {
      for (const filePath of [
        simulatorStatsPath,
        simulatorErrorPath,
      ]) {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      }
    };

    const cleanDatabaseRecords = async () => {
      if (!prisma) {
        return;
      }

      await prisma.commandAudit.deleteMany({
        where: {
          deviceId: DEVICE_ID,
        },
      });

      await prisma.deviceTelemetry.deleteMany({
        where: {
          deviceId: DEVICE_ID,
        },
      });

      await prisma.device.deleteMany({
        where: {
          serialNumber: DEVICE_ID,
        },
      });

      if (userId) {
        await prisma.user.deleteMany({
          where: {
            id: userId,
          },
        });
      } else {
        await prisma.user.deleteMany({
          where: {
            email: TEST_USER_EMAIL,
          },
        });
      }
    };

    beforeAll(async () => {
      const schema = JSON.parse(
        readFileSync(schemaPath, 'utf8'),
      );

      const mapping = JSON.parse(
        readFileSync(mappingPath, 'utf8'),
      );

      const moduleFixture: TestingModule =
        await Test.createTestingModule({
          imports: [AppModule],
        }).compile();

      app = moduleFixture.createNestApplication();

      app.enableCors();

      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );

      prisma =
        moduleFixture.get(PrismaService);

      await prisma.commandAudit.deleteMany({
        where: {
          deviceId: DEVICE_ID,
        },
      });

      await prisma.deviceTelemetry.deleteMany({
        where: {
          deviceId: DEVICE_ID,
        },
      });

      await prisma.device.deleteMany({
        where: {
          serialNumber: DEVICE_ID,
        },
      });

      await prisma.user.deleteMany({
        where: {
          email: TEST_USER_EMAIL,
        },
      });

      const user =
        await prisma.user.create({
          data: {
            email: TEST_USER_EMAIL,
            name: 'System E2E owner',
            password:
              'not-used-by-system-e2e',
            role: 'USER',
            status: 'APPROVED',
          },
        });

      userId = user.id;

      await prisma.deviceModel.upsert({
        where: {
          name: MODEL_ID,
        },
        update: {
          description:
            'System E2E smart pump model',
        },
        create: {
          name: MODEL_ID,
          description:
            'System E2E smart pump model',
        },
      });

      const modelVersion =
        await prisma.modelVersion.upsert({
          where: {
            modelId_version: {
              modelId: MODEL_ID,
              version: MODEL_VERSION,
            },
          },
          update: {
            schema,
            mapping,
          },
          create: {
            modelId: MODEL_ID,
            version: MODEL_VERSION,
            schema,
            mapping,
          },
        });

      modelVersionId = modelVersion.id;

      await prisma.device.create({
        data: {
          serialNumber: DEVICE_ID,
          name:
            'System E2E smart pump',
          type: 'pump',
          userId: user.id,
          modelVersionId:
            modelVersion.id,
          isVerified: true,
          status: 'ONLINE',
          telemetryState: 'IDLE',
        },
      });

      await app.listen(
        0,
        '127.0.0.1',
      );

      const address =
        app.getHttpServer().address() as AddressInfo;

      baseUrl =
        `http://127.0.0.1:${address.port}`;

      const mqttTransport =
        moduleFixture.get(
          MqttTransportService,
        );

      const mqttPublisher =
        moduleFixture.get(
          MqttPublisherService,
        );

      await waitForCondition(
        () => {
          const transportClient = (
            mqttTransport as unknown as {
              client: {
                connected: boolean;
              } | null;
            }
          ).client;

          const publisherClient = (
            mqttPublisher as unknown as {
              client: {
                connected: boolean;
              } | null;
            }
          ).client;

          return Boolean(
            transportClient?.connected &&
              publisherClient?.connected,
          );
        },
        10_000,
        `Backend did not connect to MQTT broker at ${MQTT_BROKER_URL}.`,
      );

      await delay(250);

      ownerToken =
        moduleFixture
          .get(JwtService)
          .sign({
            sub: user.id,
            email: user.email,
            role: user.role,
          });

      socket = io(baseUrl, {
        auth: {
          token: ownerToken,
        },
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
      });

      await new Promise<void>(
        (
          resolvePromise,
          reject,
        ) => {
          const timeout =
            setTimeout(
              () =>
                reject(
                  new Error(
                    'Socket.IO connection timed out.',
                  ),
                ),
              5_000,
            );

          socket!.once(
            'connect',
            () => {
              clearTimeout(timeout);
              resolvePromise();
            },
          );

          socket!.once(
            'connect_error',
            (error) => {
              clearTimeout(timeout);
              reject(error);
            },
          );
        },
      );

      const subscribed =
        waitForSocketEvent<{
          deviceId: string;
        }>(
          socket!,
          'device:subscribed',
          5_000,
        );

      socket!.emit(
        'device:subscribe',
        {
          deviceId: DEVICE_ID,
        },
      );

      await expect(
        subscribed,
      ).resolves.toEqual({
        deviceId: DEVICE_ID,
      });
    });

    afterAll(async () => {
      await closeChildProcess(
        simulatorProcess,
      ).catch(() => undefined);

      socket?.removeAllListeners();
      socket?.disconnect();

      if (app) {
        try {
          const redis =
            app.get<Redis>(
              'REDIS_CLIENT',
              {
                strict: false,
              },
            );

          await redis.del(
            `cache:device:${DEVICE_ID}`,
          );
        } catch {
          // Cleanup continues if Redis is unavailable.
        }
      }

      await cleanDatabaseRecords().catch(
        () => undefined,
      );

      if (app) {
        await app
          .close()
          .catch(() => undefined);
      }

      if (prisma) {
        await prisma
          .$disconnect()
          .catch(() => undefined);
      }

      await clearRetainedMessages();

      removeTemporarySimulatorFiles();
    });

    it(
      'persists attributes and mapped telemetry through the complete pipeline',
      async () => {
        simulatorProcess = spawn(
          process.execPath,
          [
            'sim.js',
            DEVICE_ID,
            MODEL_ID,
            MODEL_VERSION,
          ],
          {
            cwd: simulatorDirectory,
            env: {
              ...process.env,
              SKIP_CERT: 'true',
              LOG_LEVEL: 'warn',
              MQTT_BROKER_URL,
              REGISTRATION_URL:
                `${baseUrl}/device-certificates/register`,
              TELEMETRY_STATS_FILE:
                simulatorStatsPath,
              SIMULATOR_ERROR_LOG_FILE:
                simulatorErrorPath,
            },
            stdio: [
              'ignore',
              'pipe',
              'pipe',
            ],
          },
        );

        simulatorProcess.stdout?.on(
          'data',
          (chunk) => {
            simulatorOutput +=
              chunk.toString();
          },
        );

        simulatorProcess.stderr?.on(
          'data',
          (chunk) => {
            simulatorOutput +=
              chunk.toString();
          },
        );

        await waitForCondition(
          () => {
            if (
              simulatorProcess &&
              (simulatorProcess.exitCode !==
                null ||
                simulatorProcess.signalCode !==
                  null)
            ) {
              throw new Error(
                `Simulator exited before MQTT subscription. Output:\n${simulatorOutput}`,
              );
            }

            return simulatorOutput.includes(
              'ACTIVE TICK =',
            );
          },
          10_000,
          `Simulator did not subscribe to its command topic. Output:\n${simulatorOutput}`,
        );

        const expectedAttributes = {
          serialNumber: DEVICE_ID,
          firmware: MODEL_VERSION,
          hardwareModel: MODEL_ID,
        };

        await waitForCondition(
          async () => {
            const storedDevice =
              await prisma.device.findUnique({
                where: {
                  serialNumber:
                    DEVICE_ID,
                },
                select: {
                  attributes: true,
                },
              });

            const attributes =
              storedDevice?.attributes as
                | Record<
                    string,
                    unknown
                  >
                | null;

            return (
              attributes?.serialNumber ===
                DEVICE_ID &&
              attributes?.firmware ===
                MODEL_VERSION &&
              attributes?.hardwareModel ===
                MODEL_ID
            );
          },
          10_000,
          'Validated device attributes were not persisted.',
        );

        const attributesResponse =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/device/${DEVICE_ID}/attributes`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .expect(200);

        expect(
          attributesResponse.body,
        ).toEqual({
          serialNumber: DEVICE_ID,
          attributes:
            expectedAttributes,
        });

        const telemetryEvent =
          new Promise<TelemetryEvent>(
            (
              resolvePromise,
              reject,
            ) => {
              const requiredFields = [
                'flowRate',
                'energyUsage',
                'motorTemperature',
                'pumpEnabled',
              ];

              const timeout =
                setTimeout(() => {
                  socket!.off(
                    'telemetry:update',
                    handleTelemetry,
                  );

                  reject(
                    new Error(
                      `Timed out waiting for aggregated telemetry fields: ${requiredFields.join(', ')}`,
                    ),
                  );
                }, 20_000);

              const handleTelemetry = (
                event: TelemetryEvent,
              ) => {
                const containsAllRequiredFields =
                  requiredFields.every(
                    (field) =>
                      Array.isArray(
                        event.data?.[
                          field
                        ],
                      ),
                  );

                if (
                  !containsAllRequiredFields
                ) {
                  return;
                }

                clearTimeout(timeout);

                socket!.off(
                  'telemetry:update',
                  handleTelemetry,
                );

                resolvePromise(
                  event,
                );
              };

              socket!.on(
                'telemetry:update',
                handleTelemetry,
              );
            },
          );

        const activeCommandResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              `/device/${DEVICE_ID}/command`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              command:
                'SET_STATE',
              payload: {
                state: 'ACTIVE',
              },
            })
            .expect(201);

        /*
         * Izmenjeno:
         * odgovor sada sadrži i transportPerformance.
         */
        expect(
          activeCommandResponse.body,
        ).toMatchObject({
          success: true,
          correlationId:
            expect.any(String),
          status: 'DISPATCHED',
          transportPerformance: {
            transport: 'mqtt',
            roundTripMs:
              expect.any(Number),
          },
        });

        const persistedCommandAudit =
          await prisma.commandAudit.findUnique(
            {
              where: {
                correlationId:
                  activeCommandResponse
                    .body
                    .correlationId,
              },
            },
          );

        expect(
          persistedCommandAudit,
        ).toMatchObject({
          userId,
          deviceId: DEVICE_ID,
          command: 'SET_STATE',
          payload: {
            state: 'ACTIVE',
          },
          correlationId:
            activeCommandResponse
              .body
              .correlationId,
          result: 'SUCCESS',
          error: null,
          completedAt:
            expect.any(Date),
        });

        const socketTelemetry =
          await telemetryEvent;

        expect(
          socketTelemetry.deviceId,
        ).toBe(DEVICE_ID);

        expect(
          socketTelemetry.data,
        ).toEqual(
          expect.objectContaining({
            flowRate:
              expect.any(Array),
            energyUsage:
              expect.any(Array),
            motorTemperature:
              expect.any(Array),
            pumpEnabled:
              expect.any(Array),
          }),
        );

        expect(
          socketTelemetry.data,
        ).not.toHaveProperty(
          'metrics',
        );

        expect(
          socketTelemetry.data,
        ).not.toHaveProperty(
          'system',
        );

        expect(
          socketTelemetry.data,
        ).not.toHaveProperty(
          'attributes',
        );

        const latestResponse =
          await request(
            app.getHttpServer(),
          )
            .get(
              `/device/${DEVICE_ID}/telemetry/latest`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .expect(200);

        expect(
          latestResponse.body,
        ).toMatchObject({
          deviceId: DEVICE_ID,
          modelVersionId,
        });

        expect(
          latestResponse.body.data,
        ).toEqual(
          socketTelemetry.data,
        );

        const persistedTelemetry =
          await prisma.deviceTelemetry.findFirst(
            {
              where: {
                deviceId:
                  DEVICE_ID,
              },
              orderBy: {
                timestamp: 'desc',
              },
            },
          );

        expect(
          persistedTelemetry,
        ).not.toBeNull();

        expect(
          persistedTelemetry?.id,
        ).toBe(
          latestResponse.body.id,
        );

        expect(
          persistedTelemetry?.modelVersionId,
        ).toBe(modelVersionId);

        expect(
          persistedTelemetry?.data,
        ).toEqual(
          socketTelemetry.data,
        );

        expect(
          persistedTelemetry?.data,
        ).not.toHaveProperty(
          'attributes',
        );

        const pumpEnabledHistory =
          socketTelemetry.data
            .pumpEnabled as unknown[][];

        const currentPumpEnabled =
          pumpEnabledHistory[
            pumpEnabledHistory.length -
              1
          ]?.[0];

        const redundantCommandResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              `/device/${DEVICE_ID}/command`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              command:
                'SET_PUMP_STATE',
              payload: {
                enabled:
                  currentPumpEnabled,
              },
            })
            .expect(201);

        expect(
          redundantCommandResponse.body,
        ).toMatchObject({
          success: true,
          correlationId:
            expect.any(String),
          status: 'NOOP',
          reason:
            'ALREADY_APPLIED',
        });

        const redundantCommandAudit =
          await prisma.commandAudit.findUnique(
            {
              where: {
                correlationId:
                  redundantCommandResponse
                    .body
                    .correlationId,
              },
            },
          );

        expect(
          redundantCommandAudit,
        ).toMatchObject({
          deviceId: DEVICE_ID,
          command:
            'SET_PUMP_STATE',
          payload: {
            enabled:
              currentPumpEnabled,
          },
          result: 'NOOP',
          error: null,
          completedAt:
            expect.any(Date),
        });

        const newPumpState =
          !Boolean(
            currentPumpEnabled,
          );

        const dispatchedPumpCommand =
          await request(
            app.getHttpServer(),
          )
            .post(
              `/device/${DEVICE_ID}/command`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              command:
                'SET_PUMP_STATE',
              payload: {
                enabled:
                  newPumpState,
              },
            })
            .expect(201);

        expect(
          dispatchedPumpCommand.body,
        ).toMatchObject({
          success: true,
          correlationId:
            expect.any(String),
          status:
            'DISPATCHED',
        });

        const dispatchedPumpAudit =
          await prisma.commandAudit.findUnique(
            {
              where: {
                correlationId:
                  dispatchedPumpCommand
                    .body
                    .correlationId,
              },
            },
          );

        expect(
          dispatchedPumpAudit,
        ).toMatchObject({
          deviceId: DEVICE_ID,
          command:
            'SET_PUMP_STATE',
          payload: {
            enabled:
              newPumpState,
          },
          result: 'SUCCESS',
          error: null,
          completedAt:
            expect.any(Date),
        });

        const repeatedPumpCommand =
          await request(
            app.getHttpServer(),
          )
            .post(
              `/device/${DEVICE_ID}/command`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              command:
                'SET_PUMP_STATE',
              payload: {
                enabled:
                  newPumpState,
              },
            })
            .expect(201);

        expect(
          repeatedPumpCommand.body,
        ).toMatchObject({
          success: true,
          correlationId:
            expect.any(String),
          status: 'NOOP',
          reason:
            'ALREADY_APPLIED',
        });

        const repeatedPumpAudit =
          await prisma.commandAudit.findUnique(
            {
              where: {
                correlationId:
                  repeatedPumpCommand
                    .body
                    .correlationId,
              },
            },
          );

        expect(
          repeatedPumpAudit,
        ).toMatchObject({
          deviceId: DEVICE_ID,
          command:
            'SET_PUMP_STATE',
          payload: {
            enabled:
              newPumpState,
          },
          result: 'NOOP',
          error: null,
          completedAt:
            expect.any(Date),
        });

        const idleCommandResponse =
          await request(
            app.getHttpServer(),
          )
            .post(
              `/device/${DEVICE_ID}/command`,
            )
            .set(
              'Authorization',
              `Bearer ${ownerToken}`,
            )
            .send({
              command:
                'SET_STATE',
              payload: {
                state: 'IDLE',
              },
            })
            .expect(201);

        /*
         * Izmenjeno:
         * i IDLE DISPATCHED odgovor sadrži
         * transportPerformance.
         */
        expect(
          idleCommandResponse.body,
        ).toMatchObject({
          success: true,
          correlationId:
            expect.any(String),
          status: 'DISPATCHED',
          transportPerformance: {
            transport: 'mqtt',
            roundTripMs:
              expect.any(Number),
          },
        });
      },
    );
  },
);