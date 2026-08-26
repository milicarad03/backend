import { 
  Controller, Get, Param, Post, Body, Delete, 
  Req, UseGuards, Patch, Query, Logger, HttpException, HttpStatus, ForbiddenException, NotFoundException
} from "@nestjs/common";
import { DeviceService } from "./device.service.js";
import { Device as DeviceModel } from "../generated/prisma/client.js";
import { Role } from '../../enums/role.enum'; 
import { Roles } from '../roles.decorator'; 
import { RolesGuard } from '../roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { CreateDeviceDto } from './dto/create-device.dto';
import { DeviceTelemetryService } from './device-telemetry.service';
import { MqttTransportService } from "src/mqtt/mqtt-transport.service";
import { DeviceDashboardService } from "serverplugin";
import {
  DeviceNotFoundException,
  DeviceOfflineException,
  DeviceUninitializedException,
  CommandValidationException,
} from 'serverplugin';
import { DeviceCommandAuditService } from './device-command-audit.service';

@Controller('device')
export class DeviceController {
  private readonly logger = new Logger(DeviceController.name);

  constructor(
    private readonly deviceService: DeviceService,
    private readonly deviceTelemetryService: DeviceTelemetryService,
    private readonly mqttTransportService: MqttTransportService,
    private readonly deviceDashboardService: DeviceDashboardService,
    private readonly deviceCommandAuditService: DeviceCommandAuditService,
  ) {}

  @Get()
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDevice(
    @Req() req,
    @Query('status') status?: string,
    @Query('type') type?: string[],
    @Query('userId') userIds?: string | string[]
  ) {
    const userId = req.user.userId;
    const userRole = req.user.role;

    this.logger.log(`Fetch devices requested by user ID: ${userId} with role: ${userRole}`);

    const normalizedUserIds = Array.isArray(userIds) ? userIds : userIds ? [userIds] : [];
    const normalizedDeviceType = Array.isArray(type) ? type : type ? [type] : [];

    const filterParams = { status, type: normalizedDeviceType, userIds: normalizedUserIds };

    return this.deviceService.findDevices(userId, userRole, filterParams);
  }

  @Post()
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async registerDevice(@Req() req, @Body() deviceData: CreateDeviceDto) {
    this.logger.log(`Admin ID: ${req.user.id} is registering a new device with serial number: ${deviceData.serialNumber}`);
    return this.deviceService.createDevice(req.user.id, deviceData); 
  }

  @Get("feed")
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDevices() {
    this.logger.log('Admin requested global devices feed fetch.');
    return this.deviceService.getAllDevices();
  }

  @Get('my-devices')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getMyDevices(@Req() req) {
    const userId = req.user.userId;
    this.logger.log(`User ID: ${userId} requested personal devices list.`);
    return this.deviceService.findAllByUser(userId);
  }

  @Get(':id/telemetry/latest')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getLatestDeviceTelemetry(@Param('id') id: string, @Req() req) {
    this.logger.debug(`HTTP request for latest telemetry of device: ${id}`);
    await this.deviceService.assertDeviceAccess(id, req.user.userId, req.user.role);
    return this.deviceTelemetryService.getLatestTelemetry(id);
  }

  @Get(':id/telemetry')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDeviceTelemetry(@Param('id') id: string, @Req() req) {
    this.logger.debug(`HTTP request for telemetry history of device: ${id}`);
    await this.deviceService.assertDeviceAccess(id, req.user.userId, req.user.role);
    return this.deviceTelemetryService.getTelemetryHistory(id);
  }

  @Get('plugin-check/:deviceId')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async pluginCheck(@Param('deviceId') deviceId: string) {
    this.logger.log(`Triggering external plugin status check for device serial: ${deviceId}`);
    return this.deviceService.testPluginDeviceCheck(deviceId);
  }

  @Get(":id")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getDeviceById(@Param("id") id: string, @Req() req): Promise<DeviceModel> {
    this.logger.debug(`HTTP request for detailed view of device record: ${id}`);
    return this.deviceService.assertDeviceAccess(id, req.user.userId, req.user.role);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async deleteDevice(@Param("id") id: string, @Req() req) {
    this.logger.warn(`Device deletion requested for record: ${id} by user ID: ${req.user.userId}`);
    return this.deviceService.deleteIfAdmin(id, req.user.userId, req.user.role);
  }

  @Patch(":id/toggle")
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async toggleDevice(@Param("id") id: string, @Req() req) {
    this.logger.log(`Toggle status requested for device: ${id} by user ID: ${req.user.userId}`);
    return this.deviceService.toggleDeviceStatus(id, req.user.userId);
  }

  @Patch(":id/reassign")
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async reassignDevice(@Param("id") id: string, @Body('targetUserId') targetUserId: number, @Req() req) {
    this.logger.log(`Admin ID: ${req.user.userId} requested hardware transfer for device [${id}] to target user: ${targetUserId}`);
    return this.deviceService.reassignDevice(id, targetUserId);
  }

  @Patch(':id/model-version')
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async updateDeviceModelVersion(
    @Param('id') id: string,
    @Body() body: { modelVersionId: string },
  ) {
    this.logger.log(`Admin requested model version stage for device ${id}. Target modelVersionId: ${body.modelVersionId}`);
    return this.deviceService.applyModelVersion(id, body.modelVersionId);
  }
 
  @Post(':id/command')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async sendDeviceCommand(
    @Param('id') id: string,
    @Body() body: { command: string; payload: any },
    @Req() req
  ) {
    try {
      const userId = req.user.userId ?? req.user.id;
      const auditedCommand = await this.deviceCommandAuditService.execute(
        {
          userId,
          deviceId: id,
          command: body.command,
          payload: body.payload,
        },
        async (correlationId) => {
          await this.deviceService.assertDeviceAccess(id, userId, req.user.role);
          await this.deviceDashboardService.executeCommand(id, body.command, body.payload, { correlationId });
        },
      );

      return {
        success: true,
        correlationId: auditedCommand.correlationId,
      };
    } catch (err: any) {
      if (err instanceof DeviceNotFoundException) {
        throw new NotFoundException(err.message);
      }

      if (err instanceof DeviceOfflineException || err instanceof DeviceUninitializedException) {
        throw new ForbiddenException(err.message);
      }

      if (err instanceof CommandValidationException) {
        throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
      }

      throw err;
    }
  }

  @Get(':id/command-metadata')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getCommandMetadata(@Param('id') id: string, @Req() req) {
    await this.deviceService.assertDeviceAccess(id, req.user.userId, req.user.role);
    return this.deviceDashboardService.getCommandMetadata(id);
  }

  @Get(':serialNumber/attributes')
  @Roles(Role.USER, Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async getAttributes(@Param('serialNumber') serialNumber: string, @Req() req: any) {
    const userId = req.user.userId || req.user.sub;
    const role = req.user.role;

    return this.deviceService.getDeviceAttributes(serialNumber, Number(userId), role);
  }
}