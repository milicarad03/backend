import { Logger,Injectable,HttpException,HttpStatus, BadRequestException,NotFoundException} from "@nestjs/common";
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
  private readonly logger = new Logger(UsersService.name);
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
        this.logger.warn(`User registration failed. Email already registered: ${data.email}`);
        throw new HttpException('User with this email already exists!', HttpStatus.BAD_REQUEST);
        }
    const userCount = await this.repository.count();
  
    const initialRole = userCount === 0 ?  "ADMIN" : "USER";
    const initialStatus = initialRole === "ADMIN" ? "APPROVED" : "PENDING";
    
    this.logger.log(`Creating user ${data.email}. Role assignment: ${initialRole}, Status: ${initialStatus}`);

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
    this.logger.log(`Updating account matrix fields for unique criteria: ${JSON.stringify(where)}`);

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
    this.logger.error(`Failed status shift operation. Target account ID not found: ${userId}`);
    throw new NotFoundException(`Korisnik sa ID-em ${userId} nije pronađen.`);
  }
  const updatedUser = await this.repository.update({
      where: { id: userId },
      data: { status: status },
    });

    this.logger.log(`Account status successfully altered. User ID: ${userId} shifted state to: ${status}`);
    return updatedUser;
}

  async promoteToAdmin(userId: number) {
    return this.repository.update({
      where: { id: userId },
      data: { role: "ADMIN" },
    });
  }


  async deleteUser(userId:number, requestingAdminId:number): Promise<User> {
    if (userId === requestingAdminId) {
      this.logger.error(`Self-destruction block. Admin ID ${requestingAdminId} rejected from running loop-deletion on self.`);
      throw new BadRequestException('Ne možete obrisati sopstveni nalog!');
  }
    try {
    const deleted= await this.repository.delete({ id: userId  });
    this.logger.debug(`User record destroyed successfully from data tables. Deleted User ID: ${userId}`);
    return deleted;
  } catch (error) {
    this.logger.error(`Failed data purge. Target identity record missing or dead: ${userId}`);
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
    this.logger.warn(`Cryptographic identity confirmation failed for target string signature: ${email}`);
    
    return null;
  }

  async login(loginData:LoginDto){
    const user = await this.validateUser(loginData.email, loginData.password);
    if (!user) {
      throw new HttpException('Pogrešan email ili šifra', HttpStatus.UNAUTHORIZED);
    }
    if(user.status=="PENDING"){
      this.logger.warn(`Authentication dropped. User account ${loginData.email} blocks login due to PENDING status validation.`);
      throw new HttpException('Account not yet approved by admin', HttpStatus.FORBIDDEN);
    }
    if(user.status=="REJECTED"){
      this.logger.warn(`Authentication dropped. User account ${loginData.email} blocks login due to REJECTED status validation.`);
      throw new HttpException('Account rejected', HttpStatus.FORBIDDEN);
    }
    this.logger.log(`User ${user.email} successfully logged in. Issuing JSON Web Token.`);
    const payload = { sub: user.id, email: user.email , role: user.role};
    const { password, ...safeUser } = user;
    return {
      accessToken: this.jwtService.sign(payload),
      user: safeUser
    };
  }
}