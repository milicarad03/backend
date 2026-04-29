import { Injectable,ForbiddenException,NotFoundException } from "@nestjs/common";
import { Post, Prisma } from "../generated/prisma/client.js";
import { PostRepository } from "./post.repository.js";
import {CreatePostDto} from './dto/create-post.dto'
@Injectable()
export class PostService {
    constructor(
        private repository:PostRepository
    ) {}

    async post(where: Prisma.PostWhereUniqueInput): Promise<Post | null> {
        return this.repository.findOne(where);
    }
    async posts(params:any):Promise<Post[]>{
        return this.repository.findMany(params);
    }

    async createPost(userId:number, data: CreatePostDto): Promise<Post> {
        return this.repository.create({
        title: data.title,
        content: data.content,
        author: {
            connect: { id: userId }
        },
    });
    }

    async updatePost(params: {
        where: Prisma.PostWhereUniqueInput;
        data: Prisma.PostUpdateInput;
    }): Promise<Post> {
        return this.repository.update(params);
    }

    async deletePost(where: Prisma.PostWhereUniqueInput): Promise<Post> {
        return this.repository.delete(where);
    }

    async getDraftsByAuthorId(userId:number){
        return this.repository.findMany({
            where:{
                authorId:userId,
                published:false,
            }
        })
    }
    async getFilteredPosts(searchString: string) {
        return this.repository.findMany({
        where: {
            OR: [
            { title: { contains: searchString } },
            { content: { contains: searchString } },
            ],
        },
        });
    }
    async deleteIfOwnerOrAdmin(postId: number, userId: number, role: string) {
        const post = await this.repository.findOne({ id: postId });

        if (!post) throw new NotFoundException('Post nije pronađen');

        // Ako nije admin I nije vlasnik posta -> blokiraj
        if (role !== 'ADMIN' && post.authorId !== userId) {
            throw new ForbiddenException('Nemate dozvolu da obrišete ovaj post');
        }

        return this.repository.delete({ id: postId });
    }

    async publishIfOwner(postId: number, userId: number) {
            const post = await this.repository.findOne({ id: postId });

            if (!post) throw new NotFoundException('Post nije pronađen');

            // ako nije vlasnik posta ne moze da objavi
            if (post.authorId !== userId) {
                throw new ForbiddenException('Nemate dozvolu da objavite ovaj post');
            }

        return this.repository.update({ 
                where:{ id: postId },
                data: { published: true },
        });
    }
    async findAllByAuthor(userId: number): Promise<Post[]> {
    return this.repository.findMany({
        where: {
        authorId: userId, 
        },
        orderBy: { id: 'desc' }
    });
}
}