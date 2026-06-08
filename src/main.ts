import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, LogLevel } from '@nestjs/common';

async function bootstrap() {
 
  const requestedLevel = process.env.LOG_LEVEL || 'log';


  let logLevels: LogLevel[] = ['log', 'warn', 'error'];


  if (requestedLevel === 'debug') {
    logLevels.push('debug');
  }


  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });
  
  app.enableCors(); 
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,        
    forbidNonWhitelisted: true, 
    transform: true,         
  }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();