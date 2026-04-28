// roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true; // Ako ruta nema @Roles, dozvoli pristup
    }

    const { user } = context.switchToHttp().getRequest();
    
    // Provera: Da li korisnik ima bar jednu od potrebnih uloga?
    return requiredRoles.some((role) => user.role?.includes(role));
  }
}