import { Injectable, Logger} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js'; 
import { ModelVersion, Prisma, DeviceModel} from '../generated/prisma/client.js';

@Injectable()
export class ModelVersionRepository {
  private readonly logger = new Logger(ModelVersionRepository.name);
  constructor(private prisma: PrismaService) {}


  async findMany(params?: {
    skip?: number;
    take?: number;
    cursor?: Prisma.ModelVersionWhereUniqueInput;
    where?: Prisma.ModelVersionWhereInput;
    orderBy?: Prisma.ModelVersionOrderByWithRelationInput;
  }): Promise<ModelVersion[]> {
    const { skip, take, cursor, where, orderBy } = params || {};
    
    const records = await this.prisma.modelVersion.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });

    this.logger.debug(`Prisma findMany executed on modelVersion table. Records found: ${records.length}`);
    return records;
  }

  
  async upsertDeviceModel(params: {
  name: string;
  description?: string;
}): Promise<DeviceModel> {
  try {
    return await this.prisma.deviceModel.upsert({
      where: {
        name: params.name,
      },

      update: params.description
        ? {
            description: params.description,
          }
        : {},

      create: {
        name: params.name,
        description: params.description ?? null,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.stack
        : 'Unknown error';

    this.logger.error(
      `Error upserting device model ${params.name}`,
      errorMessage,
    );

    throw error;
  }
}
async createVersion(params: {
  modelName: string;
  version: string;
  schema: Prisma.InputJsonValue;
  mapping: Prisma.InputJsonValue;
}): Promise<ModelVersion> {
  try {
    return await this.prisma.modelVersion.create({
      data: {
        modelId: params.modelName,
        version: params.version,
        schema: params.schema,
        mapping: params.mapping,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.stack
        : 'Unknown error';

    this.logger.error(
      `Error creating model version ${params.modelName}:${params.version}`,
      errorMessage,
    );

    throw error;
  }
}


  async findOne(where: Prisma.ModelVersionWhereUniqueInput): Promise<ModelVersion | null> {
    try {
      return await this.prisma.modelVersion.findUnique({ where });
    } catch (error) {
     
      const errorMessage = error instanceof Error ? error.stack : 'Unknown error';
      this.logger.error(`Error finding model version: ${JSON.stringify(where)}`, errorMessage);
      throw error;
    }
  }
}