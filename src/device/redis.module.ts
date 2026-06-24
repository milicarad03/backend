import { Module, OnModuleDestroy, Inject, Logger} from '@nestjs/common';
import Redis from 'ioredis';

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        const logger = new Logger('RedisModule');
        const client = new Redis({ 
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          retryStrategy: (times) => Math.min(times * 50, 2000),
        });
        client.on('connect', () => logger.log('Successfully connected to Redis'));
        client.on('error', (err) => logger.error('Redis connection error:', err.message));
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