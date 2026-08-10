import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  FileFieldsInterceptor,
} from '@nestjs/platform-express';

import { ModelVersionService } from './model-version.service';
import { Role } from '../../enums/role.enum';
import { Roles } from '../roles.decorator';
import { RolesGuard } from '../roles.guard';
import { AuthGuard } from '@nestjs/passport';
import {UploadModelVersionDto} from './dto/upload-model-version.dto';

@Controller('model-versions')

export class ModelVersionController {
  private readonly logger = new Logger(ModelVersionController.name);

  constructor(private modelVersionService: ModelVersionService) {}

  @Get()
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getAllModels() {
    this.logger.log('HTTP GET /model-versions - Fetching all registered device model versions');
    return this.modelVersionService.findAll();
  }
  
  @Post('upload')
  @Roles(Role.ADMIN)
  @UseGuards(
    AuthGuard('jwt'),
    RolesGuard,
  )
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        {
          name: 'schema',
          maxCount: 1,
        },
        {
          name: 'mapping',
          maxCount: 1,
        },
      ],
      {
        limits: {
          files: 2,
          fileSize:
            2 * 1024 * 1024,
        },
      },
    ),
  )
  async uploadModelVersion(
    @Body()
    dto: UploadModelVersionDto,

    @UploadedFiles()
    files: {
      schema?: Array<{
        buffer: Buffer;
        originalname?: string;
      }>;

      mapping?: Array<{
        buffer: Buffer;
        originalname?: string;
      }>;
    },
  ) {
    this.logger.log(`HTTP POST /model-versions/upload - Uploading ${dto.modelName}:${dto.version}`, );

    return this.modelVersionService.uploadVersion(
      dto,
      files?.schema?.[0],
      files?.mapping?.[0],
    );
  }
}