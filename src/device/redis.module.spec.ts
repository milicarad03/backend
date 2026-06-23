import { Test, TestingModule } from '@nestjs/testing';
import { RedisModule } from './redis.module';
import Redis from 'ioredis';

describe('RedisModule', () => {
  let module: TestingModule;
  let redisClient: Redis;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [RedisModule],
    }).compile();
    
    redisClient = module.get<Redis>('REDIS_CLIENT');
  });

  afterAll(async () => {
    if (redisClient) {
      await redisClient.quit(); 
    }
    if (module) {
      await module.close(); 
    }
  });

  it('should provide REDIS_CLIENT', () => {
    expect(redisClient).toBeDefined();
    expect(redisClient.status).toBe('connecting');
  });
});