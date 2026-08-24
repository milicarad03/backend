import { DeviceCommandAuditService } from './device-command-audit.service';

describe('DeviceCommandAuditService', () => {
  const commandAudit = {
    create: jest.fn(),
    update: jest.fn(),
  };

  const prisma = { commandAudit };
  let service: DeviceCommandAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    commandAudit.create.mockResolvedValue({ id: 'audit-1' });
    commandAudit.update.mockResolvedValue({ id: 'audit-1' });
    service = new DeviceCommandAuditService(prisma as any);
  });

  it('persists a successful command with one correlation ID', async () => {
    const action = jest.fn().mockResolvedValue('published');

    const result = await service.execute(
      {
        userId: 7,
        deviceId: 'SN-1',
        command: 'SET_LED',
        payload: { value: true },
      },
      action,
    );

    const createData = commandAudit.create.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      userId: 7,
      deviceId: 'SN-1',
      command: 'SET_LED',
      payload: { value: true },
      result: 'PENDING',
      correlationId: expect.any(String),
    });
    expect(action).toHaveBeenCalledWith(createData.correlationId);
    expect(result).toEqual({
      correlationId: createData.correlationId,
      value: 'published',
    });
    expect(commandAudit.update).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: {
        result: 'SUCCESS',
        error: null,
        completedAt: expect.any(Date),
      },
    });
  });

  it('persists the error and rethrows a failed command', async () => {
    const error = new Error('MQTT_PUBLISH_FAILED');

    await expect(
      service.execute(
        {
          userId: 7,
          deviceId: 'SN-1',
          command: 'SET_LED',
          payload: { value: true },
        },
        async () => {
          throw error;
        },
      ),
    ).rejects.toBe(error);

    expect(commandAudit.update).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      data: {
        result: 'FAILURE',
        error: 'MQTT_PUBLISH_FAILED',
        completedAt: expect.any(Date),
      },
    });
  });

  it('does not execute a command when the initial audit write fails', async () => {
    const action = jest.fn();
    commandAudit.create.mockRejectedValue(
      new Error('AUDIT_DATABASE_UNAVAILABLE'),
    );

    await expect(
      service.execute(
        {
          userId: 7,
          deviceId: 'SN-1',
          command: 'SET_LED',
        },
        action,
      ),
    ).rejects.toThrow('AUDIT_DATABASE_UNAVAILABLE');

    expect(action).not.toHaveBeenCalled();
    expect(commandAudit.update).not.toHaveBeenCalled();
  });

  it('keeps a successful command successful if finalizing its audit fails', async () => {
    commandAudit.update.mockRejectedValue(
      new Error('AUDIT_FINALIZATION_FAILED'),
    );

    await expect(
      service.execute(
        {
          userId: 7,
          deviceId: 'SN-1',
          command: 'SET_LED',
          payload: { value: false },
        },
        async () => 'published',
      ),
    ).resolves.toEqual({
      correlationId: expect.any(String),
      value: 'published',
    });
  });
});