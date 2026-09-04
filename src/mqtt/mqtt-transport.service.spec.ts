import { Test, TestingModule } from '@nestjs/testing';
import { MqttTransportService } from './mqtt-transport.service';
import { DeviceDashboardService } from 'serverplugin';
import * as mqtt from 'mqtt';
import {
    DatabaseFailureException,
    HookFailedException,
    InvalidTimestampException,
} from 'serverplugin';
import { MqttPublisherService } from './mqtt-publisher.service';
import { MqttCommandService } from './mqtt-command.service';
import { CoapDeviceRegistryService } from '../coap/coap-device-registry.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

jest.mock('mqtt');
jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      subscriptions: [
        'iot/devices/+/telemetry',
        'iot/devices/+/status',
        'iot/devices/+/attributes',
      ],
    }),
  ),
}));

describe('MqttTransportService', () => {
    let service: MqttTransportService;
    let mockPluginCore: any;
    let mockMqttClient: any;
    let module: TestingModule;
    let messageHandler: any;
    let mockMqttPublisher: any;
    let mockMqttCommandService: any;
    let mockCoapRegistry: any;

    beforeEach(async () => {
        mockPluginCore = {
            getSubscriptionTopics: jest.fn().mockReturnValue([
                'iot/devices/+/telemetry',
                'iot/devices/+/status',
                'iot/devices/+/attributes',
            ]),
            processTelemetry: jest.fn().mockResolvedValue({ approved: true }),
            processStatus: jest.fn().mockResolvedValue(undefined),
            processAttributes: jest.fn().mockResolvedValue({ approved: true }),
        };

        mockMqttClient = {
            subscribe: jest.fn((topic, cb) => cb(null)),
            on: jest.fn(),
            end: jest.fn(),
            removeAllListeners: jest.fn(),
        };

        mockMqttPublisher = {
            publish: jest.fn(),
        };
        mockMqttCommandService = {
            handleResponse: jest.fn(),
        };
        mockCoapRegistry = {
            unregister: jest.fn(),
        };

        (mqtt.connect as jest.Mock).mockReturnValue(mockMqttClient);

        module = await Test.createTestingModule({
            providers: [
                MqttTransportService,
                { provide: DeviceDashboardService, useValue: mockPluginCore },
                { provide: MqttPublisherService, useValue: mockMqttPublisher },
                { provide: MqttCommandService, useValue: mockMqttCommandService },
                { provide: CoapDeviceRegistryService, useValue: mockCoapRegistry },
            ],
        }).compile();

        service = module.get<MqttTransportService>(MqttTransportService);
        service.onModuleInit(); 

        const connectCallback = mockMqttClient.on.mock.calls.find(call => call[0] === 'connect')[1];
        connectCallback(); 

        messageHandler = mockMqttClient.on.mock.calls.find(call => call[0] === 'message')[1];
    });

    afterEach(async () => {
        jest.clearAllMocks();
        if (module) {
            await module.close();
        }
    });

    it('should connect and subscribe to topics on init', () => {
        expect(mqtt.connect).toHaveBeenCalled();
        expect(mockMqttClient.subscribe).toHaveBeenCalledWith('iot/devices/+/telemetry', expect.any(Function));
    });

    it('should process telemetry message correctly', async () => {
        const topic = 'iot/devices/dev-123/telemetry';
        const payload = Buffer.from(JSON.stringify({ temp: 25 }));
        
        await messageHandler(topic, payload, { retain: false });
        
        expect(mockPluginCore.processTelemetry).toHaveBeenCalledWith(
            { temp: 25 },
            { deviceId: 'dev-123', topic, transport: 'mqtt' }
        );
    });

    it('should process attributes through the server plugin', async () => {
        const topic = 'iot/devices/dev-123/attributes';
        const attributesPayload = {
            serialNumber: 'dev-123',
            firmware: 'v1.2.3',
            hardwareModel: 'modelC',
        };
        const payload = Buffer.from(JSON.stringify(attributesPayload));

        await messageHandler(topic, payload, { retain: true });

        expect(mockPluginCore.processAttributes).toHaveBeenCalledWith(
            attributesPayload,
            { deviceId: 'dev-123', topic, transport: 'mqtt' },
        );
        expect(mockPluginCore.processTelemetry).not.toHaveBeenCalled();
    });

    it('should not forward rejected attributes to another processing path', async () => {
        mockPluginCore.processAttributes.mockResolvedValue({
            approved: false,
            reason: 'INVALID_ATTRIBUTES_SCHEMA',
        });
        const loggerSpy = jest.spyOn(service['logger'], 'warn');

        await messageHandler(
            'iot/devices/dev-123/attributes',
            Buffer.from(JSON.stringify({ firmware: 123 })),
            { retain: true },
        );

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('rejected attributes'),
        );
        expect(mockPluginCore.processTelemetry).not.toHaveBeenCalled();
    });

    it('should log a warning for unsupported topic syntax', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn'); 

        await messageHandler('some/random/topic', Buffer.from('{}'), { retain: false });

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('unsupported MQTT topic syntax'));
        expect(mockPluginCore.processTelemetry).not.toHaveBeenCalled();
    });

    it('should log warning when telemetry is rejected by plugin', async () => {
        mockPluginCore.processTelemetry.mockResolvedValue({ approved: false, reason: 'Too hot' });
       
        const loggerSpy = jest.spyOn(service['logger'], 'warn');

        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from('{}'), { retain: false });

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('rejected telemetry'));
    });

    it('should process status message correctly', async () => {
        const topic = 'iot/devices/dev-123/status';
        const payload = Buffer.from(JSON.stringify({ status: 'online' }));

        await messageHandler(topic, payload, { retain: false });

        expect(mockPluginCore.processStatus).toHaveBeenCalledWith(
            { status: 'online' },
            { deviceId: 'dev-123', topic, transport: 'mqtt' }
        );
        expect(mockCoapRegistry.unregister).toHaveBeenCalledWith('dev-123');
    });

    it('should disconnect on module destroy', () => {
        service['client'] = mockMqttClient;

        service.onModuleDestroy();

        expect(mockMqttClient.end).toHaveBeenCalled();
    });

    it('should warn on unsupported topic syntax', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn');

        await messageHandler(
            'iot/devices/dev-123/unknown',
            Buffer.from('{}'),
            { retain: false }
        );

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('unsupported MQTT topic syntax')
        );
    });
   
    it('should log error if subscription fails', () => {
        mockMqttClient.subscribe.mockImplementation((topic, cb) => cb(new Error('Subscription failed')));
        const loggerSpy = jest.spyOn(service['logger'], 'error');

        const connectCallback = mockMqttClient.on.mock.calls.find(call => call[0] === 'connect')[1];
        connectCallback();

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to subscribe'), expect.any(String));
    });

    it('should log error when payload is invalid JSON', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error');
        
        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from('invalid-json'), { retain: false });
        
        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('[UNHANDLED_EXCEPTION]'),
            expect.any(String) 
        );
    });

    it('should log error when MQTT client emits error event', () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error');
        const errorCallback = mockMqttClient.on.mock.calls.find(call => call[0] === 'error')[1];
        
        const err = new Error('Broker connection refused');
        errorCallback(err);

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('MQTT client connection error'), err.stack);
    });

    it('should catch and log error for empty payload', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error');
        
        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from(''), { retain: false });
        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('[UNHANDLED_EXCEPTION]'),
            expect.any(String)
        );
    });
    
    it('should warn if disconnect is called when client is null', () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn');
        service['client'] = null;

        service.onModuleDestroy();

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('already uninitialized'));
    });

    it('should catch and log error if plugin throws an exception', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error');
    
        mockPluginCore.processTelemetry.mockRejectedValue(new Error('Plugin crashed'));

        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from('{}'), { retain: false });

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('[UNHANDLED_EXCEPTION]'),
            expect.any(String)
        );
    });

    it('should handle DatabaseFailureException', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error');

        mockPluginCore.processTelemetry.mockRejectedValue(
            new DatabaseFailureException('[CRITICAL] Database service is unavailable'),
        );

        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from('{}'), { retain: false });

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining("[CRITICAL] Database service is unavailable")
        );
    });

    it('should handle HookFailedException during status processing', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error');
        mockPluginCore.processStatus.mockRejectedValue(
            new HookFailedException(),
        );

        await messageHandler('iot/devices/dev-123/status', Buffer.from(JSON.stringify({ status: 'online' })), { retain: false });

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining("[INTERNAL] Host application failed to process telemetry")
        );
    });

    it('should warn when retained telemetry message is received', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn');

        await messageHandler(
            'iot/devices/dev-123/telemetry',
            Buffer.from('{}'),
            { retain: true }
        );

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('[RETAINED]')
        );
    });

    it('should ignore retained ONLINE status messages', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'debug');

        await messageHandler(
            'iot/devices/dev-123/status',
            Buffer.from(JSON.stringify({ status: 'online' })),
            { retain: true }
        );

        expect(mockPluginCore.processStatus).not.toHaveBeenCalled();
        expect(mockCoapRegistry.unregister).not.toHaveBeenCalled();
        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('Ignoring retained non-OFFLINE status')
        );
    });

    it('should apply a retained OFFLINE status message', async () => {
        const topic = 'iot/devices/dev-123/status';
        const message = {
            deviceId: 'dev-123',
            status: 'offline',
            timestamp: '2026-09-01T12:00:00.000Z',
        };

        await messageHandler(
            topic,
            Buffer.from(JSON.stringify(message)),
            { retain: true },
        );

        expect(mockPluginCore.processStatus).toHaveBeenCalledWith(
            message,
            { deviceId: 'dev-123', topic, transport: 'mqtt' },
        );
        expect(mockCoapRegistry.unregister).toHaveBeenCalledWith('dev-123');
    });

    it('should handle INVALID_TIMESTAMP error', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn');

        mockPluginCore.processTelemetry.mockRejectedValue(
            new InvalidTimestampException(),
        );

        await messageHandler(
            'iot/devices/dev-123/telemetry',
            Buffer.from('{}'),
            { retain: false }
        );

        expect(loggerSpy).toHaveBeenCalledWith(
            '[VALIDATION] Device sent invalid timestamp.'
        );
    });

    it('should handle NotFoundException', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn');

        mockPluginCore.processTelemetry.mockRejectedValue(
            new NotFoundException('Device not found')
        );

        await messageHandler(
            'iot/devices/dev-123/telemetry',
            Buffer.from('{}'),
            { retain: false }
        );

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('[NOT_FOUND]')
        );
    });

    it('should handle ForbiddenException', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn');

        mockPluginCore.processTelemetry.mockRejectedValue(
            new ForbiddenException('Access denied')
        );

        await messageHandler(
            'iot/devices/dev-123/telemetry',
            Buffer.from('{}'),
            { retain: false }
        );

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('[SECURITY]')
        );
    });

    it('should publish STOP_DEVICE command when telemetry schema is invalid', async () => {
        mockPluginCore.processTelemetry.mockResolvedValue({
            approved: false,
            reason: 'INVALID_TELEMETRY_SCHEMA',
        });

        await messageHandler(
            'iot/devices/dev-123/telemetry',
            Buffer.from('{}'),
            { retain: false }
        );

        expect(mockMqttPublisher.publish).toHaveBeenCalledWith(
            'command',
            'dev-123',
            {
                command: 'STOP_DEVICE',
                reason: 'INVALID_TELEMETRY_SCHEMA',
            }
        );
    });

    it('should forward command responses to the command service', async () => {
        const response = {
            deviceId: 'dev-123',
            command: 'RESTART',
            correlationId: 'correlation-1',
            success: true,
        };

        await messageHandler(
            'iot/devices/dev-123/response',
            Buffer.from(JSON.stringify(response)),
            { retain: false },
        );

        expect(mockMqttCommandService.handleResponse).toHaveBeenCalledWith(
            'dev-123',
            response,
        );
    });
});
