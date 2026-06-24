import { Test, TestingModule } from '@nestjs/testing';
import { ModelVersionService } from './model-version.service';
import { ModelVersionRepository } from './model-version.repository';

describe('ModelVersionService', () => {
  let service: ModelVersionService;
  let repository: ModelVersionRepository;
  let module: TestingModule;

  const mockRepository = {
    findMany: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ModelVersionService,
        {
          provide: ModelVersionRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ModelVersionService>(ModelVersionService);
    repository = module.get<ModelVersionRepository>(ModelVersionRepository);
  });

  afterEach(async () => {
    await module.close(); 
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should call repository.findMany with sorting parameter', async () => {
      const mockResult = [{ id: '1', version: '1.0.0' }];
      mockRepository.findMany.mockResolvedValue(mockResult);

      const result = await service.findAll();

     
      expect(repository.findMany).toHaveBeenCalledWith({
        orderBy: { version: 'asc' },
      });
      expect(result).toEqual(mockResult);
    });
    
    it('should propagate errors from the repository', async () => {
      mockRepository.findMany.mockRejectedValue(new Error('Repository failure'));

      await expect(service.findAll()).rejects.toThrow('Repository failure');
    });


    it('should log the debug message', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'debug');
      mockRepository.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Executing database query via repository to retrieve sorted model versions'
      );
    });
  });
});