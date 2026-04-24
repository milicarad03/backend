import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // Ovo govori Nest-u da traži token u Headeru kao "Bearer <token>"
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.TOKEN_SECRET || 'neka_tajna_sifra', // ISTA tajna kao u AppModule
    });
  }

  async validate(payload: any) {
    // Ono što ovde vratiš biće dostupno u req.user
    return { userId: payload.sub, email: payload.email };
  }
}