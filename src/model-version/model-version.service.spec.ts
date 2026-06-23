import { Test, TestingModule } from '@nestjs/testing';
import { ModelVersionService } from './model-version.service';
import { ModelVersionRepository } from './model-version.repository';

describe('ModelVersionService', () => {
  let service: ModelVersionService;
  let repository: ModelVersionRepository;

  const mockRepository = {
    findMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

  afterEach(() => {
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
  });
});