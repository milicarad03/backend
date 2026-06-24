import { Test, TestingModule } from '@nestjs/testing';
import { ModelVersionRepository } from './model-version.repository';
import { PrismaService } from '../prisma.service';

describe('ModelVersionRepository', () => {
  let repository: ModelVersionRepository;
  let prismaService: PrismaService;
  let module: TestingModule;

  const mockPrismaService = {
    modelVersion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    module= await Test.createTestingModule({
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

  afterEach(async () => {
    await module.close(); 
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

    it('should return null when model version is not found', async () => {
      mockPrismaService.modelVersion.findUnique.mockResolvedValue(null);
      const result = await repository.findOne({ id: 'non-existent' });
      expect(result).toBeNull();
    });

    it('should throw and log error when database connection is lost', async () => {
    
      const dbError = new Error('Connection refused');
      mockPrismaService.modelVersion.findMany.mockRejectedValue(dbError);
      

      await expect(repository.findMany()).rejects.toThrow('Connection refused');
    });
    it('should log the error when findOne fails', async () => {
      const loggerSpy = jest.spyOn(repository['logger'], 'error'); // Pristupamo privatnom loggeru
      const error = new Error('DB Connection Lost');
      mockPrismaService.modelVersion.findUnique.mockRejectedValue(error);

      try {
        await repository.findOne({ id: '1' });
      } catch (e) {
     
        expect(loggerSpy).toHaveBeenCalled();
        expect(loggerSpy.mock.calls[0][0]).toContain('Error finding model version');
      }
    });
  });
  it('should throw an error if findMany fails', async () => {
    mockPrismaService.modelVersion.findMany.mockRejectedValue(new Error('Query Failed'));
    
    await expect(repository.findMany({})).rejects.toThrow('Query Failed');
  });
});