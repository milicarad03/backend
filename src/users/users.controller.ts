
import { Controller, Get, Param, Post, Body, Put, Delete,HttpException, HttpStatus,Req, Patch} from "@nestjs/common";
import { UsersService } from "./users.service.js";
import { User as UserModel } from "../generated/prisma/client.js";
import { Role } from '../../enums/role.enum'; 
import { Roles } from '../roles.decorator'; 
import { RolesGuard } from '../roles.guard';
import { JwtService } from '@nestjs/jwt';
import { UseGuards} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {CreateUserDto} from './dto/create-user.dto'
import {LoginDto} from './dto/login-user.dto'
@Controller('users')
export class UsersController {
  constructor(
      private readonly userService: UsersService,
    ) {}
  
  @Get('allusers')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'),RolesGuard)
  async getAllUsers(): Promise<UserModel[]> {
    return this.userService.users({}); 
  }

  @Post("user")
  async signupUser(@Body() userData: CreateUserDto): Promise<UserModel> {
    return this.userService.createUser(userData);
  }

  @Post("login")
    async login( @Body() loginData: LoginDto): Promise<{ accessToken: string, user: any }>{
    return this.userService.login(loginData);
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
  async makeAdmin(@Param('id') id: number) {
    return this.userService.promoteToAdmin(id);
  }

}
