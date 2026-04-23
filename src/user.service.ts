import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { User, Prisma } from "./generated/prisma/client.js";
import * as bcrypt from 'bcrypt';
@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async user(userWhereUniqueInput: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: userWhereUniqueInput,
    });
  }

  async users(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.user.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    if (!data.password) {
    throw new Error('Password is required');
  }

  // 2. Hešovanje
  const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
      ...data,
      password: hashedPassword, // Ovde prepisujemo originalnu lozinku hešovanom
    },
    });
  }

  async updateUser(params: {
    where: Prisma.UserWhereUniqueInput;
    data: Prisma.UserUpdateInput;
  }): Promise<User> {
    const { where, data } = params;
    return this.prisma.user.update({
      data,
      where,
    });
  }

  async deleteUser(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return this.prisma.user.delete({
      where,
    });
  }
  async validateUser(email: string, pass: string): Promise<User | null> {
  // 1. Pronađi korisnika u bazi preko emaila
  const user = await this.prisma.user.findUnique({
    where: { email },
  });

  // 2. Ako korisnik postoji, uporedi šifre
  if (user && user.password) {
    const isMatch = await bcrypt.compare(pass, user.password);
    if (isMatch) {
      // Ako se podudaraju, vrati korisnika (ali bez šifre zbog bezbednosti)
      const { password, ...result } = user;
      return result as User;
    }
  }
  
  // Ako korisnik ne postoji ili šifra nije tačna
  return null;
  }
}