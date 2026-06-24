import { Test, TestingModule } from '@nestjs/testing';
import { MqttTransportService } from './mqtt-transport.service';
import { DeviceDashboardService } from 'serverplugin';
import * as mqtt from 'mqtt';

jest.mock('mqtt');

describe('MqttTransportService', () => {
    let service: MqttTransportService;
    let mockPluginCore: any;
    let mockMqttClient: any;
    let module: TestingModule;
    let messageHandler: any;


    beforeEach(async () => {
        mockPluginCore = {
            getSubscriptionTopics: jest.fn().mockReturnValue(['iot/devices/+/telemetry', 'iot/devices/+/status']),
            processTelemetry: jest.fn().mockResolvedValue({ approved: true }),
            processStatus: jest.fn().mockResolvedValue(undefined),
        };

        mockMqttClient = {
        subscribe: jest.fn((topic, cb) => cb(null)),
        on: jest.fn(),
        end: jest.fn(),
        removeAllListeners: jest.fn(),
        };

        (mqtt.connect as jest.Mock).mockReturnValue(mockMqttClient);

        module= await Test.createTestingModule({
        providers: [
            MqttTransportService,
            { provide: DeviceDashboardService, useValue: mockPluginCore },
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
        
        await messageHandler(topic, payload);
        
        expect(mockPluginCore.processTelemetry).toHaveBeenCalledWith(
        { temp: 25 },
        { deviceId: 'dev-123', topic, transport: 'mqtt' }
        );
    });

    it('should log a warning for unsupported topic syntax', async () => {
   
        const loggerSpy = jest.spyOn(service['logger'], 'warn'); 

        await messageHandler('some/random/topic', Buffer.from('{}'));

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('unsupported MQTT topic syntax'));
        expect(mockPluginCore.processTelemetry).not.toHaveBeenCalled();
    });

    it('should log warning when telemetry is rejected by plugin', async () => {
        mockPluginCore.processTelemetry.mockResolvedValue({ approved: false, reason: 'Too hot' });
       
        const loggerSpy = jest.spyOn(service['logger'], 'warn');

        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from('{}'));

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('rejected telemetry'));
    });

    it('should process status message correctly', async () => {
      

        const topic = 'iot/devices/dev-123/status';
        const payload = Buffer.from(JSON.stringify({ status: 'online' }));

        await messageHandler(topic, payload);

        expect(mockPluginCore.processStatus).toHaveBeenCalledWith(
            { status: 'online' },
            { deviceId: 'dev-123', topic, transport: 'mqtt' }
        );
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
            Buffer.from('{}')
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
        
        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from('invalid-json'));
        
        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to parse or process incoming MQTT payload'),
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
        
     
        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from(''));
        
        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to parse or process incoming MQTT payload'),
            expect.any(String)
        );
    });

    
    it('should warn if disconnect is called when client is null', () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn');
        service['client'] = null; // Simuliramo stanje gde klijent ne postoji

        service.onModuleDestroy();

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('already uninitialized'));
    });
    it('should catch and log error if plugin throws an exception', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error');
    
        mockPluginCore.processTelemetry.mockRejectedValue(new Error('Plugin crashed'));

        await messageHandler('iot/devices/dev-123/telemetry', Buffer.from('{}'));

    
        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to parse or process incoming MQTT payload'),
            expect.any(String)
        );
    });


});