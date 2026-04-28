import { Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { Post, Prisma } from "../generated/prisma/client.js";


@Injectable()
export class PostRepository {
  constructor(private prisma: PrismaService) {}


    async findOne(where: Prisma.PostWhereUniqueInput): Promise<Post| null> {
        return this.prisma.post.findUnique({where});
    }


    async findMany(params: {
        skip?: number;
        take?: number;
        cursor?: Prisma.PostWhereUniqueInput;
        where?: Prisma.PostWhereInput;
        orderBy?: Prisma.PostOrderByWithRelationInput;
        }): Promise<Post[]> {
        const { skip, take, cursor, where, orderBy } = params;
        return this.prisma.post.findMany({
            skip,
            take,
            cursor,
            where,
            orderBy,
        });
    }
    
    async create(data: Prisma.PostCreateInput): Promise<Post>{
        return this.prisma.post.create({data});
    }

    async update(params:{
       where:Prisma.PostWhereUniqueInput,
       data:Prisma.PostUpdateInput
        }):Promise<Post> {
            return this.prisma.post.update(params);
    }

    async delete(where:Prisma.PostWhereUniqueInput):Promise<Post> {
            return this.prisma.post.delete({where});
    }
    
}
