import { Test, TestingModule } from '@nestjs/testing';
import { ModelVersionRepository } from './model-version.repository';
import { PrismaService } from '../prisma.service';

describe('ModelVersionRepository', () => {
  let repository: ModelVersionRepository;
  let prismaService: PrismaService;

  const mockPrismaService = {
    modelVersion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelVersionRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<ModelVersionRepository>(ModelVersionRepository);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findMany', () => {
    it('should call prisma.modelVersion.findMany with correct params', async () => {
      const mockRecords = [{ id: '1', version: '1.0.0' }];
      mockPrismaService.modelVersion.findMany.mockResolvedValue(mockRecords);

      const params = { take: 10, where: { id: '1' } };
      const result = await repository.findMany(params);

      expect(prismaService.modelVersion.findMany).toHaveBeenCalledWith({
        skip: undefined,
        take: 10,
        cursor: undefined,
        where: { id: '1' },
        orderBy: undefined,
      });
      expect(result).toEqual(mockRecords);
    });
    it('should handle findMany without params', async () => {
      mockPrismaService.modelVersion.findMany.mockResolvedValue([]);
      
      await repository.findMany();

      expect(prismaService.modelVersion.findMany).toHaveBeenCalledWith({
        skip: undefined,
        take: undefined,
        cursor: undefined,
        where: undefined,
        orderBy: undefined,
      });
    });
  });

  describe('findOne', () => {
    it('should call prisma.modelVersion.findUnique with correct where clause', async () => {
      const mockRecord = { id: '1', version: '1.0.0' };
      mockPrismaService.modelVersion.findUnique.mockResolvedValue(mockRecord);

      const result = await repository.findOne({ id: '1' });

      expect(prismaService.modelVersion.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      });
      expect(result).toEqual(mockRecord);
    });
  });
});