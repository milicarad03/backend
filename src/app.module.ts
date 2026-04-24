import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users/users.controller';
import { PrismaService } from "./prisma.service.js"; 
import { UserService } from "./user.service.js"; 
import { PostService } from "./post.service.js"; 
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy'; 



@Module({
  imports: [
    PassportModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.register({
      global: true, // Ovo omogućava da ne moraš da ga uvoziš u svaki podmodul
      secret: process.env.TOKEN_SECRET || 'neka_tajna_sifra', // Koristi tajnu iz .env fajla
      signOptions: { expiresIn: '1h' }, // Token važi sat vremena
    }),
    
  ],
  controllers: [AppController],
  providers: [AppService,PrismaService,UserService,PostService,JwtStrategy],
})
export class AppModule {}
