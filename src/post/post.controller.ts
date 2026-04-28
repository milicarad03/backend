import { Controller, Get, Param, Post, Body, Put, Delete,HttpException, HttpStatus,Req, Patch} from "@nestjs/common";
import { PostService } from "../post/post.service.js";
import { Post as PostModel } from "../generated/prisma/client.js";
import { Role } from '../../enums/role.enum'; 
import { Roles } from '../roles.decorator'; 
import { RolesGuard } from '../roles.guard';
import { JwtService } from '@nestjs/jwt';
import { UseGuards} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';



@Controller('post')
export class PostController {
  constructor(
      private readonly postService: PostService,
      private readonly jwtService: JwtService,
    ) {}

    @Get("drafts")
    @UseGuards(AuthGuard('jwt'))
    async getDraftsByEmail(@Req() req){
        return this.postService.getDraftsByAuthorId(req.user.userId);
    }

    @Get("post/:id")
    async getPostById(@Param("id") id: string): Promise<PostModel | null> {
        return this.postService.post({ id: Number(id) });
    }

    

    @Get("feed")
    async getPublishedPosts(){
        return this.postService.posts({where:{published:true}})

    }
    

    @Get("filtered-posts/:searchString")
    async getFilteredPosts(@Param("searchString") searchString: string): Promise<PostModel[]> {
        return this.postService.getFilteredPosts(searchString);
    }

    
    @Post("post")
    @Roles(Role.USER, Role.ADMIN) // mogu da postuju i korisnik i admin
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    async createDraft(
        @Req() req,
        @Body() postData: { title: string; content?: string},
        ){
        return this.postService.createPost({
        title: postData.title,
        content: postData.content,
         author: {
            connect: { id: req.user.userId } 
        },
        });
    }

    

    @Put("publish/:id")
    @UseGuards(AuthGuard('jwt'))
    async publishPost(@Param("id") id: string, @Req() req) {
    // Servis treba da proveri da li korisnik poseduje ovaj post
    return this.postService.publishIfOwner(Number(id), req.user.userId);
  }

    

    @Delete("post/:id")
    @Roles(Role.USER, Role.ADMIN) 
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    async deletePost(@Param("id") id: string, @Req() req){
    ///post  mogu da obrisu samo vlasnik ili admin
    return this.postService.deleteIfOwnerOrAdmin(Number(id), req.user.userId, req.user.role);
  }
    

    @Get('my-posts')
    @UseGuards(AuthGuard('jwt'))
    async getMyPosts(@Req() req) {
        
        const userId = req.user.userId; 

        // 
        return this.postService.findAllByAuthor(userId);
    }

}