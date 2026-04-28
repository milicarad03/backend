import { Injectable,HttpException,HttpStatus} from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { User, Prisma } from "../generated/prisma/client.js";
import * as bcrypt from 'bcrypt';
import { UserRepository } from "./users.repository.js";
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UserService {
  constructor(
    private repository: UserRepository,
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

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    const existingUser = await this.repository.findOne({ email: data.email });
    
      if (existingUser) {
        throw new HttpException(
          'Korisnik sa ovim email-om već postoji!', 
          HttpStatus.BAD_REQUEST
          );
        }
    const userCount = await this.repository.count();
  
  // Ako nema nijednog, postavi mu ulogu admina
    const initialRole = userCount === 0 ?  "ADMIN" : "USER";
    if (!data.password) {
    throw new Error('Password is required');
  }


  const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.repository.create({
      ...data,
      password: hashedPassword,
      role: initialRole,
    
    });
  }

  async updateUser(params: {
    where: Prisma.UserWhereUniqueInput;
    data: Prisma.UserUpdateInput;
  }): Promise<User> {
    const { where, data } = params;
    return this.repository.update({
      data,
      where,
    });
  }

  async promoteToAdmin(userId: number) {
    return this.repository.update({
      where: { id: userId },
      data: { role: "ADMIN" },
    });
  }

  async deleteUser(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return this.repository.delete(where);
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


  async login(email:string, pass:string){
    const user = await this.validateUser(email, pass);
    if (!user) {
      throw new HttpException('Pogrešan email ili šifra', HttpStatus.UNAUTHORIZED);
    }
    const payload = { sub: user.id, email: user.email , role: user.role};
    const { password, ...safeUser } = user;
    //console.log(user.role);
    return {
      accessToken: this.jwtService.sign(payload),
      user: safeUser
    };
  }

 
}