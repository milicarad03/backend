import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';

import {
  ModelVersion,
  Prisma,
} from '../generated/prisma/client.js';

import { ModelVersionRepository } from './model-version.repository';

import { UploadModelVersionDto } from './dto/upload-model-version.dto';

import { validateModelDefinition} from 'serverplugin';

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
  
  private parseJsonFile(
    buffer: Buffer,
    label: string,
  ): unknown {
    try {
      return JSON.parse(
        buffer.toString('utf8'),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown JSON parsing error';

      throw new BadRequestException(
        `${label}_INVALID_JSON: ${message}`,
      );
    }
  }

  async uploadVersion(
  dto: UploadModelVersionDto,

  schemaFile?: {
    buffer: Buffer;
    originalname?: string;
  },

  mappingFile?: {
    buffer: Buffer;
    originalname?: string;
  },
) {
  if (!schemaFile || !mappingFile) {
    throw new BadRequestException(
      'SCHEMA_AND_MAPPING_FILES_REQUIRED',
    );
  }

  const schema =
    this.parseJsonFile(
      schemaFile.buffer,
      'SCHEMA',
    );

  const mapping =
    this.parseJsonFile(
      mappingFile.buffer,
      'MAPPING',
    );

  const validation =
    validateModelDefinition(
      dto.modelName,
      schema,
      mapping,
    );

  if (!validation.valid) {
    this.logger.warn(
      `Rejected model version ${dto.modelName}:${dto.version}. Errors: ${validation.errors.join(', ')}`,
    );

    throw new BadRequestException({
      message:
        'SCHEMA_MAPPING_COMPATIBILITY_FAILED',

      errors:
        validation.errors,
    });
  }

  const existingVersion =
    await this.repository.findOne({
      modelId_version: {
        modelId:
          dto.modelName,

        version:
          dto.version,
      },
    });

  if (existingVersion) {
    throw new ConflictException(
      'MODEL_VERSION_ALREADY_EXISTS',
    );
  }

  await this.repository.upsertDeviceModel({
    name:
      dto.modelName,

    description:
      dto.description,
  });
  const created =
    await this.repository.createVersion({
      modelName:
        dto.modelName,

      version:
        dto.version,

      schema:
        schema as Prisma.InputJsonValue,

      mapping:
        mapping as Prisma.InputJsonValue,
    });

  this.logger.log(
    `Uploaded model version ${dto.modelName}:${dto.version}`,
  );

  return {
    ...created,

    validation: {
      valid: true,
    },
  };
}


}