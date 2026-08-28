import { Module } from '@nestjs/common';
import { MqttTransportService } from './mqtt-transport.service';
import { MqttPublisherService } from './mqtt-publisher.service';
import { MqttCommandService } from './mqtt-command.service';

@Module({
  providers: [
    MqttPublisherService,
    MqttCommandService,
  ],
  exports: [

    MqttPublisherService,
    MqttCommandService,
  ],
})
export class MqttModule {}
