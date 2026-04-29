
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../../enums/role.enum';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}