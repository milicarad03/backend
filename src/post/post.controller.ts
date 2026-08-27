import { Controller, Get, Param, Post, Body, Put, Delete,HttpException, HttpStatus,Req, Patch} from "@nestjs/common";
import { PostService } from "../post/post.service.js";
import { Post as PostModel } from "../generated/prisma/client.js";
import { Role } from '../../enums/role.enum'; 
import { Roles } from '../roles.decorator'; 
import { RolesGuard } from '../roles.guard';
import { JwtService } from '@nestjs/jwt';
import { UseGuards} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {CreatePostDto} from './dto/create-post.dto'


@Controller('post')
export class PostController {
  constructor(
      private readonly postService: PostService,
      private readonly jwtService: JwtService,
    ) {}

    @Get("drafts")
    @Roles(Role.USER, Role.ADMIN) 
    @UseGuards(AuthGuard('jwt'), RolesGuard)
  
    async getDraftsByEmail(@Req() req){
        return this.postService.getDraftsByAuthorId(req.user.userId);
    }

    @Get("post/:id")
    async getPostById(@Param("id") id: number): Promise<PostModel | null> {
        return this.postService.post({ id });
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
    @Roles(Role.USER, Role.ADMIN) 
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    async createDraft(
        @Req() req,
        @Body() postData: CreatePostDto,
        ){
        return this.postService.createPost(req.user.userId, postData);
    }

    @Put("publish/:id")
    @Roles(Role.USER, Role.ADMIN) 
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    async publishPost(@Param("id") id: string, @Req() req) {
    return this.postService.publishIfOwner(Number(id), req.user.userId);
  }

    

    @Delete("post/:id")
    @Roles(Role.USER, Role.ADMIN) 
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    async deletePost(@Param("id") id: string, @Req() req){
    return this.postService.deleteIfOwnerOrAdmin(Number(id), req.user.userId, req.user.role);
  }
    

    @Get('my-posts')
    @Roles(Role.USER, Role.ADMIN) 
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    async getMyPosts(@Req() req) {
        const userId = req.user.userId; 
        return this.postService.findAllByAuthor(userId);
    }

}