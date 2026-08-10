import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UploadModelVersionDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, {
    message:
      'modelName may contain only letters, numbers, dot, underscore and dash',
  })
  modelName!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, {
    message:
      'version may contain only letters, numbers, dot, underscore and dash',
  })
  version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}