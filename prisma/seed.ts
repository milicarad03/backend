import { PrismaService } from '../src/prisma.service.js';
import * as fs from 'fs';
import * as path from 'path';


const prisma = new PrismaService();

async function main() {
  console.log('Započinjem punjenje baze podataka (Seeding)...');

  
  const modelsFolderPath = path.join(process.cwd(), 'schema');

 
  const modeli = ['device-2', 'device-3', 'sn-100'];

  for (const modelName of modeli) {
    const folderZaModel = path.join(modelsFolderPath, modelName);

   
    if (!fs.existsSync(folderZaModel)) {
      console.warn(`Folder ${folderZaModel} ne postoji. Preskačem...`);
      continue;
    }
    const schemaPath = path.join(folderZaModel, 'schema.json');
    const mapperPath = path.join(folderZaModel, 'mapper.json');

    if (!fs.existsSync(schemaPath) || !fs.existsSync(mapperPath)) {
    console.warn(`Nedostaju schema ili mapper za ${modelName}`);
    continue;
    }


    const schemaRaw = fs.readFileSync(path.join(folderZaModel, 'schema.json'), 'utf8');
    const mapperRaw = fs.readFileSync(path.join(folderZaModel, 'mapper.json'), 'utf8');


    const schemaJson = JSON.parse(schemaRaw);
    const mapperJson = JSON.parse(mapperRaw);

   

    console.log(`Upisujem u bazu: ${modelName}...`);

  
    const deviceModel = await prisma.deviceModel.upsert({
      where: { name: modelName },
      update: {},
      create: {
        name: modelName,
        description: `Automatski uvezen model ${modelName} sa diska`,
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

  console.log('Baza podataka je uspešno osvežena šemama i maperima!');
}

main()
  .catch((e) => {
    console.error(' Kritična greška tokom izvršavanja seed skripte:', e);
    process.exit(1);
  })
  .finally(async () => {
    
    if (typeof (prisma as any).$disconnect === 'function') {
      await (prisma as any).$disconnect();
    }
  });