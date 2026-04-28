
import { Controller, Get, Param, Post, Body, Put, Delete,HttpException, HttpStatus,Req, Patch} from "@nestjs/common";
import { UserService } from "./users.service.js";
import { User as UserModel } from "../generated/prisma/client.js";
import { Role } from '../../enums/role.enum'; 
import { Roles } from '../roles.decorator'; 
import { RolesGuard } from '../roles.guard';
import { JwtService } from '@nestjs/jwt';
import { UseGuards} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('users')
export class UsersController {
  constructor(
      private readonly userService: UserService,
    ) {}
  
  @Get('allusers')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'),RolesGuard)
  async getAllUsers(): Promise<UserModel[]> {
    return this.userService.users({}); 
  }

  @Post("user")
  async signupUser(@Body() userData: { name?: string; email: string; password:string }): Promise<UserModel> {

    return this.userService.createUser(userData);
  }

  @Post("login")
    async login( @Body() loginData: { email: string; password: string }): Promise<{ accessToken: string, user: any }>{
    return this.userService.login(loginData.email, loginData.password);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req) {
    // req.user je ono sto vraca validate metoda
    return req.user; 
  }

  @Patch('user/make-admin/:id')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async makeAdmin(@Param('id') id: string) {
    return this.userService.promoteToAdmin(Number(id));
  }

}
