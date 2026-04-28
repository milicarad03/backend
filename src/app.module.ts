import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users/users.controller';
import { PostController } from './post/post.controller';
import { PrismaService } from "./prisma.service.js"; 
import { UserService } from "./users/users.service.js"; 
import { PostService } from "./post/post.service.js"; 
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy'; 
import { UserRepository } from './users/users.repository';
import { PostRepository } from './post/post.repository';


@Module({
  imports: [
    PassportModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.register({
      global: true, // da moze da se uvozi u svaki podmodul
      secret: process.env.TOKEN_SECRET, 
      signOptions: { expiresIn: '1h' }, 
    }),
    
  ],
  controllers: [AppController,UsersController,PostController],
  providers: [AppService,PrismaService,UserService,PostService,JwtStrategy,UserRepository,PostRepository],
})
export class AppModule {}
