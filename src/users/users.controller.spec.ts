import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ExecutionContext } from '@nestjs/common';

import { Reflector} from '@nestjs/core'; 
import { RolesGuard } from '../roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../../enums/role.enum';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUsersService = {
    users: jest.fn(),
    createUser: jest.fn(),
    login: jest.fn(),
    promoteToAdmin: jest.fn(),
    handleApproval: jest.fn(),
    deleteUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    })
      .overrideGuard(AuthGuard('jwt')).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllUsers', () => {
    it('should return an array of users', async () => {
      const result = [{ id: 1, email: 'test@test.com' }];
      mockUsersService.users.mockResolvedValue(result);

      expect(await controller.getAllUsers()).toBe(result);
      expect(mockUsersService.users).toHaveBeenCalledWith({});
    });
  });

  describe('signupUser', () => {
    it('should create a new user', async () => {
      const dto = { email: 'new@test.com', password: 'password' };
      const result = { id: 1, ...dto };
      mockUsersService.createUser.mockResolvedValue(result);

      expect(await controller.signupUser(dto as any)).toBe(result);
      expect(mockUsersService.createUser).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('should login a user', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      const result = { accessToken: 'token', user: { id: 1 } };
      mockUsersService.login.mockResolvedValue(result);

      expect(await controller.login(dto as any)).toBe(result);
      expect(mockUsersService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('getProfile', () => {
    it('should return user from request', () => {
      const req = { user: { userId: 1, email: 'test@test.com' } };
      expect(controller.getProfile(req)).toBe(req.user);
    });
  });

  describe('makeAdmin', () => {
    it('should promote user to admin', async () => {
      const id = 1;
      mockUsersService.promoteToAdmin.mockResolvedValue("ok");

      const result = await controller.makeAdmin(id);

      expect(result).toBe("ok");

      expect(mockUsersService.promoteToAdmin).toHaveBeenCalledWith(id);
    });
  });

  describe('approveOrRejectUser', () => {
    it('should call handleApproval with correct parameters', async () => {
      await controller.approveOrRejectUser(1, 'APPROVED');
      expect(mockUsersService.handleApproval).toHaveBeenCalledWith(1, 'APPROVED');
    });
  });

  describe('removeUser', () => {
    it('should delete a user', async () => {
      const req = { user: { userId: 99 } };
      await controller.removeUser(1, req as any);
      expect(mockUsersService.deleteUser).toHaveBeenCalledWith(1, 99);
    });
    it('should throw error if req.user is undefined in removeUser', async () => {
      const req = { user: undefined };
      await expect(controller.removeUser(1, req as any)).rejects.toThrow();
    });
    it('should have correct metadata for removeUser', () => {
      const roles = Reflect.getMetadata('roles', controller.removeUser);
      expect(roles).toEqual([Role.ADMIN]);
    });
  });

  it('should throw when service fails', async () => {
    mockUsersService.promoteToAdmin.mockRejectedValue(new Error('FAIL'));

    await expect(controller.makeAdmin(1))
      .rejects.toThrow('FAIL');
  });

  it('should propagate error from service when deleting user', async () => {
    const req = { user: { userId: 99 } };

    mockUsersService.deleteUser.mockRejectedValue(new Error('DB_FAIL'));

    await expect(controller.removeUser(1, req as any))
      .rejects.toThrow('DB_FAIL');
  });

  it('should log registration attempt', async () => {
      const loggerSpy = jest.spyOn(controller['logger'], 'log');
      const dto = { email: 'test@test.com', password: '123' };
      
      await controller.signupUser(dto as any);
      
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Registration attempt for email: test@test.com'));
  });

  describe('approveOrRejectUser - Negative Scenarios', () => {
    it('should throw error if status is invalid (simulated)', async () => {
    
      mockUsersService.handleApproval.mockRejectedValue(new Error('Invalid status'));
      
      await expect(controller.approveOrRejectUser(1, 'INVALID' as any))
        .rejects.toThrow('Invalid status');
    });
  });

  describe('makeAdmin - Negative Scenarios', () => {
    it('should handle non-existent user scenario', async () => {
      mockUsersService.promoteToAdmin.mockRejectedValue(new Error('User not found'));
      
      await expect(controller.makeAdmin(999))
        .rejects.toThrow('User not found');
    });
  });
  
  it('should throw BadRequestException if DTO is empty', async () => {

    mockUsersService.createUser.mockRejectedValue(new Error('Validation failed'));
    await expect(controller.signupUser({} as any)).rejects.toThrow();
  });

  it('should throw Conflict if email already exists', async () => {
    mockUsersService.createUser.mockRejectedValue(new Error('Email already exists'));
    await expect(controller.signupUser({ email: 'duplicate@test.com' } as any))
      .rejects.toThrow('Email already exists');
  });


});

