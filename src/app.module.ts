import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersController } from './users/users.controller';
import { PrismaService } from "./prisma.service.js"; 
import { UserService } from "./user.service.js"; 
import { PostService } from "./post.service.js"; 




@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService,PrismaService,UserService,PostService],
})
export class AppModule {}
