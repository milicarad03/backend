import { Controller, Get, UseGuards, Logger} from '@nestjs/common';
import { ModelVersionService } from './model-version.service';
import { Role } from '../../enums/role.enum'; 
import { Roles } from '../roles.decorator'; 
import { RolesGuard } from '../roles.guard';
import { AuthGuard } from '@nestjs/passport';

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
}