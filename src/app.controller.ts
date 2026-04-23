import { Controller, Get, Param, Post, Body, Put, Delete,HttpException, HttpStatus} from "@nestjs/common";
import { UserService } from "./user.service.js";
import { PostService } from "./post.service.js";
import { User as UserModel } from "./generated/prisma/client.js";
import { Post as PostModel } from "./generated/prisma/client.js";
import { AppService } from "./app.service.js";

@Controller()
export class AppController {
  constructor(
    private readonly UserService: UserService,
    private readonly postService: PostService,
    private readonly appService: AppService
  ) {}
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  @Get('users')
  async getAllUsers(): Promise<UserModel[]> {
    return this.UserService.users({}); // Prosledi prazan objekat
  }

  @Get("post/:id")
  async getPostById(@Param("id") id: string): Promise<PostModel | null> {
    return this.postService.post({ id: Number(id) });
  }

  @Get("feed")
  async getPublishedPosts(): Promise<PostModel[]> {
    return this.postService.posts({
      where: { published: true },
    });
  }

  @Get("filtered-posts/:searchString")
  async getFilteredPosts(@Param("searchString") searchString: string): Promise<PostModel[]> {
    return this.postService.posts({
      where: {
        OR: [
          {
            title: { contains: searchString },
          },
          {
            content: { contains: searchString },
          },
        ],
      },
    });
  }

  @Post("post")
  async createDraft(
    @Body() postData: { title: string; content?: string; authorEmail: string },
  ): Promise<PostModel> {
    const { title, content, authorEmail } = postData;
    return this.postService.createPost({
      title,
      content,
      author: {
        connect: { email: authorEmail },
      },
    });
  }

  @Post("user")
  async signupUser(@Body() userData: { name?: string; email: string; password:string }): Promise<UserModel> {
    return this.UserService.createUser(userData);
  }

  @Put("publish/:id")
  async publishPost(@Param("id") id: string): Promise<PostModel> {
    return this.postService.updatePost({
      where: { id: Number(id) },
      data: { published: true },
    });
  }

  @Post("login")
  async login( @Body() loginData: { email: string; password: string }): Promise<UserModel | { message: string }> {
  const user = await this.UserService.validateUser(loginData.email, loginData.password);
  
  if (!user) {
    //return { message: "Pogrešan email ili šifra!" };
    throw new HttpException('Pogrešan email ili šifra', HttpStatus.UNAUTHORIZED);
  }

  return user; // Vraća podatke o korisniku ako je login uspešan
  }

  @Delete("post/:id")
  async deletePost(@Param("id") id: string): Promise<PostModel> {
    return this.postService.deletePost({ id: Number(id) });
  }
}