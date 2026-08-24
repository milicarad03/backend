
import {Logger, Controller, Get, Param, Post, Body, Put, Delete,HttpException, HttpStatus,Req, Patch, ParseIntPipe} from "@nestjs/common";
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
  private readonly logger = new Logger(UsersController.name);
  constructor(
      private readonly userService: UsersService,
    ) {}
  
  @Get('allusers')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'),RolesGuard)
  async getAllUsers(): Promise<UserModel[]> {
    this.logger.log('HTTP GET /users/allusers - Admin fetching complete users register.');
    return this.userService.users({}); 
  }

  @Post("user")
  async signupUser(@Body() userData: CreateUserDto): Promise<UserModel> {
    this.logger.log(`HTTP POST /users/user - Registration attempt for email: ${userData.email}`);
    return this.userService.createUser(userData);
  }

  @Post("login")
    async login( @Body() loginData: LoginDto): Promise<{ accessToken: string, user: any }>{
    this.logger.log(`HTTP POST /users/login - Login attempt for email: ${loginData.email}`);
    return this.userService.login(loginData);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req) {
    // req.user je ono sto vraca validate metoda
    this.logger.debug(`HTTP GET /users/profile - Active profile checked by user ID: ${req.user?.userId}`);
    return req.user; 
  }

  @Patch('user/make-admin/:id')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async makeAdmin(@Param('id', ParseIntPipe) id: number) {
    this.logger.warn(`HTTP PATCH /users/user/make-admin/:id - Target user ID: ${id} promotion initiated`);
    return this.userService.promoteToAdmin(id);
  }

  @Patch('approval/:id')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async approveOrRejectUser(
    @Param('id', ParseIntPipe) id: number, 
    @Body('status') status: "APPROVED" | "REJECTED"
  ) {
    this.logger.log(`HTTP PATCH /users/approval/:id - Processing status update to ${status} for target user ID: ${id}`);
    return this.userService.handleApproval(id, status);
  }


  @Delete('user/:id')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async removeUser(@Param('id', ParseIntPipe) id: number,@Req() req) {
    this.logger.warn(`HTTP DELETE /users/user/:id - Admin ID: ${req.user.userId} requested removal of user ID: ${id}`);
    return this.userService.deleteUser(id, req.user.userId);
  }
}