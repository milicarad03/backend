import { Test, TestingModule } from '@nestjs/testing';
import { UsersRepository } from './users.repository';
import { PrismaService } from '../prisma.service';

describe('UsersRepository', () => {
    let repository: UsersRepository;
    let prisma: PrismaService;

    const mockPrismaService = {
        user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
        providers: [
            UsersRepository,
            { provide: PrismaService, useValue: mockPrismaService },
        ],
        }).compile();

        repository = module.get<UsersRepository>(UsersRepository);
        prisma = module.get<PrismaService>(PrismaService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should find a unique user', async () => {
        const user = { id: 1, email: 'test@test.com' };
        mockPrismaService.user.findUnique.mockResolvedValue(user);

        expect(await repository.findOne({ id: 1 })).toEqual(user);
        expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should find many users', async () => {
        const users = [{ id: 1 }, { id: 2 }];
        mockPrismaService.user.findMany.mockResolvedValue(users);

        expect(await repository.findMany({})).toEqual(users);
        expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it('should count users', async () => {
        mockPrismaService.user.count.mockResolvedValue(5);
        expect(await repository.count()).toBe(5);
    });

    it('should create a user', async () => {
        const data = { email: 'new@test.com', password: 'pwd' };
        mockPrismaService.user.create.mockResolvedValue({ id: 1, ...data });

        await repository.create(data as any);
        expect(prisma.user.create).toHaveBeenCalledWith({ data });
    });

    it('should update a user', async () => {
        const params = { where: { id: 1 }, data: { email: 'updated@test.com' } };
        await repository.update(params as any);
        expect(prisma.user.update).toHaveBeenCalledWith(params);
    });

    it('should delete a user', async () => {
        const user = { id: 1 };
        mockPrismaService.user.delete.mockResolvedValue(user);

        const result = await repository.delete({ id: 1 });
        expect(result).toEqual(user);
        expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should pass params correctly to findMany', async () => {
        const params = {
            skip: 1,
            take: 10,
            where: { email: 'test@test.com' },
            orderBy: { id: 'asc' as any },
        };

        mockPrismaService.user.findMany.mockResolvedValue([]);

        await repository.findMany(params);

        expect(prisma.user.findMany).toHaveBeenCalledWith(params);
    });

    it('should propagate error on create failure', async () => {
        mockPrismaService.user.create.mockRejectedValue(new Error('DB_FAIL'));

        await expect(repository.create({} as any))
            .rejects.toThrow('DB_FAIL');
    });
    it('should log debug message on delete', async () => {
        const loggerSpy = jest.spyOn(repository['logger'], 'debug');

        const user = { id: 1 };
        mockPrismaService.user.delete.mockResolvedValue(user);

        await repository.delete({ id: 1 });

        expect(loggerSpy).toHaveBeenCalledWith(
            expect.stringContaining('deleted user record')
        );
    });
    it('should return null if user is not found', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(null);
        const result = await repository.findOne({ id: 999 });
        expect(result).toBeNull();
    });
    it('should propagate error on update failure', async () => {
        mockPrismaService.user.update.mockRejectedValue(new Error('UPDATE_FAIL'));
        await expect(repository.update({ where: { id: 1 }, data: {} }))
            .rejects.toThrow('UPDATE_FAIL');
    });
    it('should propagate error when trying to delete a non-existent user', async () => {
        mockPrismaService.user.delete.mockRejectedValue(new Error('Record to delete does not exist'));
        
        await expect(repository.delete({ id: 999 }))
            .rejects.toThrow('Record to delete does not exist');
    });
});