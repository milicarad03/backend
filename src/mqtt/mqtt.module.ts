import { Module } from '@nestjs/common';
import { MqttTransportService } from './mqtt-transport.service';
import { MqttPublisherService } from './mqtt-publisher.service';

@Module({
  providers: [
    MqttPublisherService,
  ],
  exports: [

    MqttPublisherService,
  ],
})
export class MqttModule {}