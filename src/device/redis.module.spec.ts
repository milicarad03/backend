import { Test, TestingModule } from '@nestjs/testing';
import { RedisModule } from './redis.module';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

jest.mock('ioredis', () => require('ioredis-mock'));

describe('RedisModule', () => {
  let module: TestingModule;
  let redisClient: Redis;
  beforeEach(() => {
   
    (redisClient as any).flushall();
  });

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
    expect(redisClient).toBeInstanceOf(RedisMock);
  });
  it('should be configured with correct host and port', () => {
    expect(redisClient.options.host).toBe(process.env.REDIS_HOST || 'localhost');
    expect(redisClient.options.port).toBe(parseInt(process.env.REDIS_PORT || '6379'));
  });
  it('should be functional', async () => {
    await redisClient.set('test-key', 'hello');
    const value = await redisClient.get('test-key');
    expect(value).toBe('hello');
  });
  it('should log error when redis emits an error event', () => {
    const loggerSpy = jest.spyOn(require('@nestjs/common').Logger.prototype, 'error');
    
    redisClient.emit('error', new Error('Mocked connection error'));
    
    expect(loggerSpy).toHaveBeenCalledWith(
      'Redis connection error:', 
      'Mocked connection error'
    );
    
    loggerSpy.mockRestore();
  });
});