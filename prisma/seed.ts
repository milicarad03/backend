import { PrismaService } from '../src/prisma.service.js';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

const prisma = new PrismaService();
const logger = new Logger('Seed');

async function main() {
  logger.log('Starting database seeding process...');

  const modelsFolderPath = path.join(process.cwd(), 'schema');
  const modeli = ['modelB', 'modelC', 'modelA', 'modelD', 'modelE'];

  for (const modelName of modeli) {
    const folderZaModel = path.join(modelsFolderPath, modelName);

    if (!fs.existsSync(folderZaModel)) {
      logger.warn(`Directory ${folderZaModel} does not exist. Skipping...`);
      continue;
    }

    const schemaPath = path.join(folderZaModel, 'schema.json');
    const mapperPath = path.join(folderZaModel, 'mapper.json');

    if (!fs.existsSync(schemaPath) || !fs.existsSync(mapperPath)) {
      logger.warn(`Missing schema.json or mapper.json for model: ${modelName}`);
      continue;
    }

    const schemaRaw = fs.readFileSync(schemaPath, 'utf8');
    const mapperRaw = fs.readFileSync(mapperPath, 'utf8');

    const schemaJson = JSON.parse(schemaRaw);
    const mapperJson = JSON.parse(mapperRaw);

    logger.log(`Persisting device model metadata to database: ${modelName}`);

    const deviceModel = await prisma.deviceModel.upsert({
      where: { name: modelName },
      update: {},
      create: {
        name: modelName,
        description: `Automatically imported model ${modelName} from disk repository`,
      },
    });

    await prisma.modelVersion.upsert({
      where: {
        modelId_version: {
          modelId: deviceModel.name,
          version: '1.0.0',
        },
      },
      update: {
        schema: schemaJson,
        mapping: mapperJson,
      },
      create: {
        version: '1.0.0',
        schema: schemaJson,
        mapping: mapperJson,
        modelId: deviceModel.name,
      },
    });
  }

  logger.log('Database database state successfully synchronized with local schemas and mappers!');
}

main()
  .catch((e) => {
    logger.error(`Critical exception caught during database seed execution lifecycle: ${e.message}`, e.stack);
    process.exit(1);
  })
  .finally(async () => {
    if (typeof (prisma as any).$disconnect === 'function') {
      await (prisma as any).$disconnect();
    }
  });