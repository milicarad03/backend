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

@Controller('device')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
  ) {}

 
@Get()
@Roles(Role.USER, Role.ADMIN)
@UseGuards(AuthGuard('jwt'), RolesGuard)
async getDevice(
  @Req() req, 
  @Query('own') own?: string,    // Hvataj ih pojedinačno
  @Query('status') status?: string,
  @Query('type') type?: string
) {
  const userId = req.user.userId;
  const userRole = req.user.role;

  // Ručno spakuj u objekat da budemo 100% sigurni
  const filterParams = { own, status, type };
  
  console.log('Kontroler primio own:', own); // Proveri ovaj log!

  return this.deviceService.findDevices(userId, userRole, filterParams);
}
  @Post()
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async registerDevice( @Req() req, @Body() deviceData: CreateDeviceDto) {
    return this.deviceService.createDevice(req.user.userId, deviceData); //mozda treba +
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


  // device.controller.ts

 // device.controller.ts

  @Get(":id")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDeviceById(@Param("id", ParseIntPipe) id: string): Promise<DeviceModel | null> {
    return this.deviceService.getDevice({ id });
  }

  
  @Delete(":id")
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async deleteDevice(@Param("id", ParseIntPipe) id: string, @Req() req) {
    return this.deviceService.deleteIfAdmin(id, req.user.userId, req.user.role);
  }

  
  @Patch(":id/toggle")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async toggleDevice(@Param("id", ParseIntPipe) id: string, @Req() req) {
    return this.deviceService.toggleDeviceStatus(id, req.user.userId);
  }
}