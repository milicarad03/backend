import { Module } from '@nestjs/common';
import { ModelVersionController } from './model-version.controller';
import { ModelVersionService } from './model-version.service';
import { ModelVersionRepository } from './model-version.repository';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [], 
  controllers: [ModelVersionController],
  providers: [ModelVersionService, ModelVersionRepository, PrismaService],
  exports: [ModelVersionService],
})
export class ModelVersionModule {}