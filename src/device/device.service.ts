import { Injectable, ForbiddenException, NotFoundException, ConflictException, InternalServerErrorException, Logger } from "@nestjs/common";
import { Device, Prisma } from "../generated/prisma/client.js";
import { DeviceRepository } from "./device.repository.js";
import { CreateDeviceDto } from './dto/create-device.dto';
import { DeviceDashboardService } from "serverplugin";

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private repository: DeviceRepository,
    private dashboardPlugin: DeviceDashboardService,
  ) {}

  async getDevice(where: Prisma.DeviceWhereUniqueInput): Promise<Device | null> {
    return this.repository.findOne(where);
  }
    
  async getAllDevices() {
    return this.repository.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createDevice(userId: number, data: CreateDeviceDto): Promise<Device> {
    const targetId = data.targetUserId ? data.targetUserId : userId;
    try {
      const createdDevice = await this.repository.create({
        serialNumber: data.serialNumber,
        name: data.name,
        type: data.type,
        user: { connect: { id: targetId } },
        modelVersion: { connect: { id: data.modelVersionId } }
      });
      this.logger.log(`Successfully persisted new device record. ID: ${createdDevice.id}, Serial: ${data.serialNumber}`);
      return createdDevice;
    } catch (error: any) {
      if (error.code === 'P2002') {
        this.logger.warn(`Device registration conflict. Serial already exists: ${data.serialNumber}`);
        throw new ConflictException('DEVICE_SERIAL_ALREADY_EXISTS');
      }
      if (error.code === 'P2025') {
        this.logger.warn(`Device registration failed. Target user ID: ${targetId} or model version ID: ${data.modelVersionId} missing.`);
        throw new NotFoundException('SPECIFIED_MODEL_OR_USER_NOT_FOUND');
      }
      this.logger.error(`Database transaction exception caught during device creation: ${error.message}`, error.stack);
      throw new InternalServerErrorException('DATABASE_CONNECTION_ERROR');
    }
  }

  async updateDevice(params: { where: Prisma.DeviceWhereUniqueInput; data: Prisma.DeviceUpdateInput; }): Promise<Device> {
    return this.repository.update(params);
  }

  async deleteDevice(where: Prisma.DeviceWhereUniqueInput): Promise<Device> {
    return this.repository.delete(where);
  }

  async findAllByUser(userId: number): Promise<Device[]> {
    return this.repository.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findDevices(userId: number, role: string, filters: any) {
    this.logger.debug(`Building analytical search matrix query options for filters: ${JSON.stringify(filters)}`);

    const whereClause: any = {};

    if (role !== 'ADMIN') {
      whereClause.userId = userId;
    } else if (role === 'ADMIN' && filters.userIds && filters.userIds.length > 0) {
      whereClause.userId = {
        in: filters.userIds.map((id: any) => Number(id))
      };
    }

    if (filters.type && filters.type.length > 0) {
      whereClause.type = { in: filters.type };
    }
    
    if (filters.modelVersionIds && filters.modelVersionIds.length > 0) {
      whereClause.modelVersionId = {
        in: filters.modelVersionIds.map((id: any) => Number(id))
      };
    }
    
    if (filters.search) {
      whereClause.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { serialNumber: { contains: filters.search, mode: 'insensitive' } }
      ];
    }
      
    if (filters.status && filters.status !== 'ALL') {
      whereClause.status = filters.status;
    }
       
    this.logger.debug(`Prisma final device search matching criteria block: ${JSON.stringify(whereClause)}`);
    
    const devices = await this.repository.findMany({
      where: whereClause,
      include: {
        modelVersion: true,
        user: true
      }
    });

    return {
      data: devices,          
      meta: {
        total: devices.length, 
        filterUsed: whereClause
      }
    };
  }

  async deleteIfAdmin(deviceId: string, userId: number, role: string) {
    const device = await this.repository.findOne({ id: deviceId });

    if (!device) {
      this.logger.warn(`Aborting administrative deletion task. Record not found: ${deviceId}`);
      throw new NotFoundException('Device not found');
    }

    if (role !== 'ADMIN') {
      this.logger.error(`Unauthorized deletion payload block. Action denied for non-admin context user: ${userId}`);
      throw new ForbiddenException('Permission denied for removing device');
    }

    const deleted = await this.repository.delete({ id: deviceId });
    this.logger.log(`Administrative process destroyed device record successfully. ID: ${deviceId}`);
    return deleted;
  }

  async toggleDeviceStatus(deviceId: string, userId: number): Promise<Device> {
    const device = await this.repository.findOne({ id: deviceId });
    if (!device) {
      this.logger.warn(`Aborting power toggle task. Record not found: ${deviceId}`);
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      this.logger.error(`Security guard block. User ID: ${userId} lacks ownership permissions for device target: ${deviceId}`);
      throw new ForbiddenException('Permission denied for toggling device');
    }

    const updated = await this.repository.update({
      where: { id: deviceId },
      data: { isActive: !device.isActive },
    });

    this.logger.log(`Toggled operational activation status state for device: ${deviceId}. New state: ${updated.isActive}`);
    return updated;
  }

  async testPluginDeviceCheck(deviceId: string) {
    try {
      return await this.dashboardPlugin.checkDevice(deviceId);
    } catch (pluginError: any) {
      this.logger.error(`Plugin interaction runtime exception caught for identity check [${deviceId}]: ${pluginError.message}`);
      throw pluginError;
    }
  }
  async reassignDevice(deviceSerial: string, newUserId: number) {
  this.logger.log(`Reassigning device ${deviceSerial} to user ID: ${newUserId}`);
  
  return this.repository.update({
    where: { serialNumber: deviceSerial },
    data: { 
      user: {
        connect: { id: newUserId }
      }
    }
  });
}


async markDeviceAsVerified(serialNumber: string, certSerialNumber: string): Promise<Device> {
  this.logger.log(`Marking device ${serialNumber} as verified with cert serial ${certSerialNumber}.`);
  
  return this.repository.update({
   
    where: { serialNumber }, 
    data: { 
      isVerified: true, 
      verifiedAt: new Date(),
      
      certSerialNumber: certSerialNumber, 
    }
  });
}
}