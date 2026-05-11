import { Injectable,HttpException,HttpStatus, BadRequestException,NotFoundException} from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { User, Prisma } from "../generated/prisma/client.js";
import * as bcrypt from 'bcrypt';
import { UsersRepository } from "./users.repository.js";
import { JwtService } from '@nestjs/jwt';
import {CreateUserDto} from './dto/create-user.dto'
import {LoginDto} from './dto/login-user.dto'
import {AdminUpdateUserDto} from './dto/admin-update-to-user.dto'
import {UpdateUserDto} from './dto/update-user.dto'


@Injectable()
export class UsersService {
  constructor(
    private repository: UsersRepository,
    private jwtService:JwtService

  ) {}

  async user(userWhereUniqueInput: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return this.repository.findOne(userWhereUniqueInput);
  }
  async users(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    return this.repository.findMany(params);
  }

  async createUser(data: CreateUserDto): Promise<User> {
    const existingUser = await this.repository.findOne({ email: data.email });
    
      if (existingUser) {
        throw new HttpException(
          'Korisnik sa ovim email-om već postoji!', 
          HttpStatus.BAD_REQUEST
          );
        }
    const userCount = await this.repository.count();
  
    const initialRole = userCount === 0 ?  "ADMIN" : "USER";
    const initialStatus = initialRole === "ADMIN" ? "APPROVED" : "PENDING";
    


  const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.repository.create({
      ...data,
      password: hashedPassword,
      role: initialRole,
      status:initialStatus,
    });
  }

  async updateUser(params: {
    where: Prisma.UserWhereUniqueInput;
    data: AdminUpdateUserDto | UpdateUserDto| Prisma.UserUpdateInput; }): Promise<User> {
    const { where, data } = params;
    const updateData = { ...data } as any; 

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
      
      return this.repository.update({
        data:updateData,
        where,
      });
  }
  

async handleApproval(userId: number, status: 'APPROVED' | 'REJECTED') {
  console.log('Update status za ID:', userId, 'na:', status);
  const user = await this.repository.findOne({ id: userId });
  
  if (!user) {
    throw new NotFoundException(`Korisnik sa ID-em ${userId} nije pronađen.`);
  }
  return this.repository.update({
    where: { id: userId },
    data: { status: status },
  });
}

 

  async promoteToAdmin(userId: number) {
    return this.repository.update({
      where: { id: userId },
      data: { role: "ADMIN" },
    });
  }


  async deleteUser(userId:number, requestingAdminId:number): Promise<User> {
    if (userId === requestingAdminId) {
      throw new BadRequestException('Ne možete obrisati sopstveni nalog!');
  }
    try {
    return await this.repository.delete({ id: userId  });
  } catch (error) {
    throw new NotFoundException(`Korisnik sa ID-em ${userId} nije pronađen.`);
  }
  }


  async validateUser(email: string, pass: string): Promise<User | null> {
  
    const user = await this.repository.findOne({ email });
    if (user && user.password) {
      const isMatch = await bcrypt.compare(pass, user.password);
      if (isMatch) {
        const { password, ...result } = user;
        return result as User;
      }
    }
    
    return null;
  }


  async login(loginData:LoginDto){
    const user = await this.validateUser(loginData.email, loginData.password);
    if (!user) {
      throw new HttpException('Pogrešan email ili šifra', HttpStatus.UNAUTHORIZED);
    }
    if(user.status=="PENDING"){
      throw new HttpException('Account not yet approved by admin', HttpStatus.FORBIDDEN);
    }
    if(user.status=="REJECTED"){
      throw new HttpException('Account rejected', HttpStatus.FORBIDDEN);
    }
    const payload = { sub: user.id, email: user.email , role: user.role};
    const { password, ...safeUser } = user;
    return {
      accessToken: this.jwtService.sign(payload),
      user: safeUser
    };
  }

 
}