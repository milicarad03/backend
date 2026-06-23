import { Test, TestingModule } from '@nestjs/testing';
import { ModelVersionController } from './model-version.controller';
import { ModelVersionService } from './model-version.service';

describe('ModelVersionController', () => {
  let controller: ModelVersionController;
  let service: ModelVersionService;

  const mockModelVersionService = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModelVersionController],
      providers: [
        {
          provide: ModelVersionService,
          useValue: mockModelVersionService,
        },
      ],
    }).compile();

    controller = module.get<ModelVersionController>(ModelVersionController);
    service = module.get<ModelVersionService>(ModelVersionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllModels', () => {
    it('should return an array of model versions', async () => {
      const mockModels = [{ id: '1', name: 'Sensor v1' }];
      mockModelVersionService.findAll.mockResolvedValue(mockModels);

      const result = await controller.getAllModels();

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockModels);
    });
  });
});