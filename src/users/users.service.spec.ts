import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { JwtService } from '@nestjs/jwt';
import { HttpException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
    let service: UsersService;
    let repository: UsersRepository;
    let jwtService: JwtService;

    const mockRepository = {
        findOne: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };

    const mockJwtService = {
        sign: jest.fn(() => 'mock-token'),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
        providers: [
            UsersService,
            { provide: UsersRepository, useValue: mockRepository },
            { provide: JwtService, useValue: mockJwtService },
        ],
        }).compile();

        service = module.get<UsersService>(UsersService);
        repository = module.get<UsersRepository>(UsersRepository);
        jwtService = module.get<JwtService>(JwtService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createUser', () => {
        it('should throw BAD_REQUEST if user exists', async () => {
        mockRepository.findOne.mockResolvedValue({ email: 'test@test.com' });
        await expect(service.createUser({ email: 'test@test.com', password: '123' } as any))
            .rejects.toThrow(HttpException);
        });

        it('should hash password and create admin if first user', async () => {
        mockRepository.findOne.mockResolvedValue(null);
        mockRepository.count.mockResolvedValue(0);
        (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
        
        await service.createUser({ email: 'admin@test.com', password: '123' } as any);
        
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            password: 'hashed_password',
            role: 'ADMIN',
            status: 'APPROVED'
        }));
        });
    });

    describe('login', () => {
        it('should throw UNAUTHORIZED if user not found', async () => {
        jest.spyOn(service, 'validateUser').mockResolvedValue(null);
        await expect(service.login({ email: 'a@a.com', password: '1' }))
            .rejects.toThrow('Pogrešan email ili šifra');
        });

        it('should throw FORBIDDEN if status is PENDING', async () => {
        jest.spyOn(service, 'validateUser').mockResolvedValue({ status: 'PENDING' } as any);
        await expect(service.login({ email: 'a@a.com', password: '1' }))
            .rejects.toThrow('Account not yet approved by admin');
        });

        it('should return token on success', async () => {
        const user = { id: 1, email: 'a@a.com', status: 'APPROVED' };
        jest.spyOn(service, 'validateUser').mockResolvedValue(user as any);
        
        const result = await service.login({ email: 'a@a.com', password: '1' });
        expect(result.accessToken).toBe('mock-token');
        });
    });

    describe('deleteUser', () => {
        it('should throw BadRequest if deleting self', async () => {
        await expect(service.deleteUser(1, 1))
            .rejects.toThrow('Ne možete obrisati sopstveni nalog!');
        });

        it('should delete user if IDs differ', async () => {
        mockRepository.delete.mockResolvedValue({ id: 1 });
        await service.deleteUser(1, 2);
        expect(mockRepository.delete).toHaveBeenCalledWith({ id: 1 });
        });
    });

    describe('validateUser', () => {
    it('should return user without password if credentials match', async () => {
        const user = { id: 1, email: 'a@a.com', password: 'hashed' };

        mockRepository.findOne.mockResolvedValue(user);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const result = await service.validateUser('a@a.com', '123');

        expect(result).toEqual({ id: 1, email: 'a@a.com' });
    });

    it('should return null if password does not match', async () => {
        mockRepository.findOne.mockResolvedValue({ password: 'hashed' });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        const result = await service.validateUser('a@a.com', '123');

        expect(result).toBeNull();
    });
    });

    it('should throw FORBIDDEN if status is REJECTED', async () => {
    jest.spyOn(service, 'validateUser').mockResolvedValue({
        status: 'REJECTED'
    } as any);

    await expect(service.login({ email: 'a', password: '1' }))
        .rejects.toThrow('Account rejected');
    });

    describe('updateUser', () => {
    it('should hash password if provided', async () => {
        (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

        await service.updateUser({
        where: { id: 1 },
        data: { password: '123' },
        } as any);

        expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
            data: expect.objectContaining({ password: 'hashed' }),
        })
        );
    });
    });
    describe('handleApproval', () => {
    it('should throw if user not found', async () => {
        mockRepository.findOne.mockResolvedValue(null);

        await expect(service.handleApproval(1, 'APPROVED'))
        .rejects.toThrow();
    });

    it('should update status if user exists', async () => {
        mockRepository.findOne.mockResolvedValue({ id: 1 });
        mockRepository.update.mockResolvedValue({ id: 1, status: 'APPROVED' });

        const result = await service.handleApproval(1, 'APPROVED');

        expect(result.status).toBe('APPROVED');
    });
    });
    it('should throw NotFound if delete fails', async () => {
        mockRepository.delete.mockRejectedValue(new Error());

        await expect(service.deleteUser(1, 2))
            .rejects.toThrow(NotFoundException);
    });
    describe('promoteToAdmin', () => {
        it('should call repository.update with role ADMIN', async () => {
            mockRepository.update.mockResolvedValue({ id: 1, role: 'ADMIN' });
            await service.promoteToAdmin(1);
            expect(mockRepository.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { role: 'ADMIN' }
            });
        });
    });
    it('should not hash password if not provided', async () => {
        await service.updateUser({
            where: { id: 1 },
            data: { email: 'new@test.com' },
        } as any);

        expect(repository.update).toHaveBeenCalledWith(
            expect.objectContaining({
            data: expect.not.objectContaining({ password: expect.anything() }),
            })
        );
    });

});