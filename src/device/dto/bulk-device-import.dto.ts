import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class BulkDeviceDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
    message:
      'serialNumber may contain only letters, numbers, dots, underscores and hyphens',
  })
  serialNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  model!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  version!: string;
}

export class BulkDeviceImportDto {
  @IsEmail()
  targetUserEmail!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BulkDeviceDefinitionDto)
  devices!: BulkDeviceDefinitionDto[];
}
