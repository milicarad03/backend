import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateDeviceDto {
  @IsNotEmpty({ message: 'Serial number is required' })
  @IsString()
  serialNumber!:string

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;
}