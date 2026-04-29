import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsNotEmpty({ message: 'Naslov je obavezan' })
  @IsString()
  @MaxLength(100, { message: 'Naslov može imati maksimalno 100 karaktera' })
  title!: string;

  @IsOptional()
  @IsString()
  content?: string;
}