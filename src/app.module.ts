import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtModule } from '@nestjs/jwt';
import { PostController } from './post/post.controller';
import { PrismaService } from "./prisma.service.js"; 
import { UsersService } from "./users/users.service.js"; 
import { PostService } from "./post/post.service.js"; 
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy'; 
import { PostRepository } from './post/post.repository';
import {UsersModule} from './users/users.module'
import {PostModule} from './post/post.module'


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
    UsersModule,
    PostModule,
  ],
  controllers: [AppController,PostController],
  providers: [AppService,JwtStrategy],
})
export class AppModule {}
