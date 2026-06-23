import { Module, OnModuleDestroy, Inject} from '@nestjs/common';
import Redis from 'ioredis';

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        const client = new Redis({ host: 'localhost', port: 6379 });
        client.on('connect', () => console.log('Connected to Redis'));
        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule implements OnModuleDestroy {
  
  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {}

  async onModuleDestroy() {
    console.log('Closing Redis connection...');
    await this.client.quit();
  }
}