import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { PrismaService } from '../prisma.service';

@Module({
    imports :[],
    controllers:[UsersController],
    providers:[UsersRepository, UsersService, PrismaService],
    exports: [UsersService],
})
export class UsersModule{}