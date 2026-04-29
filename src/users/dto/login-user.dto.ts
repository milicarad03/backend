import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Morate uneti ispravan email' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Šifra je obavezna' })
  password!: string;
}