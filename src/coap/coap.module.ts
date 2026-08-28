import { Module } from '@nestjs/common';
import { MqttModule } from '../mqtt/mqtt.module';
import { DeviceCommandService } from '../device/device-command.service';
import { CoapCommandService } from './coap-command.service';
import { CoapDeviceRegistryService } from './coap-device-registry.service';

@Module({
  imports: [MqttModule],
  providers: [
    CoapDeviceRegistryService,
    CoapCommandService,
    DeviceCommandService,
  ],
  exports: [
    CoapDeviceRegistryService,
    CoapCommandService,
    DeviceCommandService,
  ],
})
export class CoapModule {}
