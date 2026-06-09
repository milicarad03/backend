import { Injectable, Logger} from '@nestjs/common';
import { ModelVersionRepository } from './model-version.repository';
import { ModelVersion } from '../generated/prisma/client.js';

@Injectable()
export class ModelVersionService {
     private readonly logger = new Logger(ModelVersionService.name);

  constructor(private repository: ModelVersionRepository) {}

  async findAll(): Promise<ModelVersion[]> {
    this.logger.debug('Executing database query via repository to retrieve sorted model versions');
 
    return this.repository.findMany({
      orderBy: { version: 'asc' },
    });
  }
}