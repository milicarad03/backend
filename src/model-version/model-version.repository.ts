import { Injectable, Logger} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js'; 
import { ModelVersion, Prisma } from '../generated/prisma/client.js';

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


  async findOne(where: Prisma.ModelVersionWhereUniqueInput): Promise<ModelVersion | null> {
    
    return this.prisma.modelVersion.findUnique({
      where,
    });
  }
}