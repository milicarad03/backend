import { Test, TestingModule } from '@nestjs/testing';
import { ModelVersionController } from './model-version.controller';
import { ModelVersionService } from './model-version.service';
import { ROLES_KEY } from '../roles.decorator';
import { Reflector} from '@nestjs/core'; 
import { RolesGuard } from '../roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../../enums/role.enum';

describe('ModelVersionController', () => {
  let controller: ModelVersionController;
  let service: ModelVersionService;
  let reflector: Reflector;
  let module: TestingModule;

  const mockModelVersionService = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [ModelVersionController],
      providers: [
        {
          provide: ModelVersionService,
          useValue: mockModelVersionService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<ModelVersionController>(ModelVersionController);
    service = module.get<ModelVersionService>(ModelVersionService);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(async () => {
    await module.close(); 
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
    it('should have correct roles metadata', () => {
      const roles = reflector.get(ROLES_KEY, controller.getAllModels);
      expect(roles).toEqual([Role.USER, Role.ADMIN]);
    });
    it('should apply AuthGuard and RolesGuard', () => {
      const guards = Reflect.getMetadata('__guards__', controller.getAllModels);
      expect(guards).toContain(AuthGuard('jwt'));
      expect(guards).toContain(RolesGuard);
    });

    // 4. NOVO: Test za Error Handling
    it('should propagate errors from the service', async () => {
      mockModelVersionService.findAll.mockRejectedValue(new Error('Database error'));
      await expect(controller.getAllModels()).rejects.toThrow('Database error');
    });
  });
 
});
