import { 
  Controller, Get, Param, Post, Body, Delete, 
  Req, UseGuards, Patch, 
  ParseIntPipe, Query
} from "@nestjs/common";
import { DeviceService } from "./device.service.js";
import { Device as DeviceModel } from "../generated/prisma/client.js";
import { Role } from '../../enums/role.enum'; 
import { Roles } from '../roles.decorator'; 
import { RolesGuard } from '../roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { CreateDeviceDto } from './dto/create-device.dto';
import { DeviceTelemetryService } from './device-telemetry.service';
@Controller('device')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly deviceTelemetryService:DeviceTelemetryService,
    
  ) {}

 
  
  @Get()
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDevice( @Req() req, @Query('status') status?: string, @Query('type') type?: string[], @Query('userId') userIds?: string | string[] ) {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // sve se pretvara u niz iako je stigao jedan id
    const normalizedUserIds = Array.isArray(userIds) ? userIds : userIds ? [userIds] : [];
    const normalizedDeviceType = Array.isArray(type) ? type : type ? [type] : [];

    const filterParams = { status, type : normalizedDeviceType, userIds: normalizedUserIds };

    const result = await this.deviceService.findDevices(userId, userRole, filterParams);
    return result;
}

  @Post()
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async registerDevice( @Req() req, @Body() deviceData: CreateDeviceDto) {
    
    return this.deviceService.createDevice(req.user.id, deviceData); 
  }

  @Get("feed")
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
    async getDevices(){
        return this.deviceService.getAllDevices();
    }

  
  @Get('my-devices')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getMyDevices(@Req() req) {
    const userId = req.user.userId;
    return this.deviceService.findAllByUser(userId);
  }

  @Get(':id/telemetry/latest')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getLatestDeviceTelemetry(@Param('id') id: string) {
    return this.deviceTelemetryService.getLatestTelemetry(id);
  }

   @Get(':id/telemetry')
   @Roles(Role.USER, Role.ADMIN)
   @UseGuards(AuthGuard('jwt'), RolesGuard)
   async getDeviceTelemetry(@Param('id') id: string) {
      return this.deviceTelemetryService.getTelemetryHistory(id);
   }

   @Get('plugin-check/:deviceId')
   @Roles(Role.USER, Role.ADMIN)
   @UseGuards(AuthGuard('jwt'), RolesGuard)
   async pluginCheck(@Param('deviceId') deviceId: string) {
    return this.deviceService.testPluginDeviceCheck(deviceId);
   }



  @Get(":id")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDeviceById(@Param("id") id: string): Promise<DeviceModel | null> {
    return this.deviceService.getDevice({ id });
  }

  
  @Delete(":id")
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async deleteDevice(@Param("id") id: string, @Req() req) {
    return this.deviceService.deleteIfAdmin(id, req.user.userId, req.user.role);
  }

  
  @Patch(":id/toggle")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async toggleDevice(@Param("id") id: string, @Req() req) {
    return this.deviceService.toggleDeviceStatus(id, req.user.userId);
  }
  
}