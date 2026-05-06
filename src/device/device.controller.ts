import { 
  Controller, Get, Param, Post, Body, Delete, 
  Req, UseGuards, Patch 
} from "@nestjs/common";
import { DeviceService } from "./device.service.js";
import { Device as DeviceModel } from "../generated/prisma/client.js";
import { Role } from '../../enums/role.enum'; 
import { Roles } from '../roles.decorator'; 
import { RolesGuard } from '../roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { CreateDeviceDto } from './dto/create-device.dto';

@Controller('device')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
  ) {}

 
  @Post()
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async registerDevice( @Req() req, @Body() deviceData: CreateDeviceDto) {
    return this.deviceService.createDevice(req.user.userId, deviceData);
  }

  @Get("feed")
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

  
  @Get(":id")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDeviceById(@Param("id") id: string): Promise<DeviceModel | null> {
    return this.deviceService.getDevice({ id });
  }

  
  @Delete(":id")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async deleteDevice(@Param("id") id: string, @Req() req) {
    return this.deviceService.deleteIfOwnerOrAdmin(id, req.user.userId, req.user.role);
  }

  
  @Patch(":id/toggle")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async toggleDevice(@Param("id") id: string, @Req() req) {
    return this.deviceService.toggleDeviceStatus(id, req.user.userId);
  }
}