import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { PostRepository } from './post.repository';
import { PrismaService } from '../prisma.service';

@Module({
    imports :[],
    controllers:[PostController],
    providers:[PostRepository, PostService, PrismaService],
    exports: [PostService],
})
export class PostModule{}