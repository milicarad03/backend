import { Injectable, ForbiddenException, NotFoundException, ConflictException, InternalServerErrorException, Logger } from "@nestjs/common";
import { Device, Prisma, DeviceStatus } from "../generated/prisma/client.js";
import { DeviceRepository } from "./device.repository.js";
import { CreateDeviceDto } from './dto/create-device.dto';
import { DeviceDashboardService } from "serverplugin";
import { DeviceCommandService } from "./device-command.service.js";

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private repository: DeviceRepository,
    private dashboardPlugin: DeviceDashboardService,
    private commandService: DeviceCommandService,
  ) {}
  private async ensureDeviceExists(where: Prisma.DeviceWhereUniqueInput): Promise<Device> {
    const device = await this.repository.findOne(where);
    if (!device) {
      this.logger.warn(`Device operation aborted: Record not found for criteria: ${JSON.stringify(where)}`);
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  async getDevice(where: Prisma.DeviceWhereUniqueInput): Promise<Device | null> {
    return this.repository.findOne(where);
  }

  async assertDeviceAccess(
    serialNumber: string,
    userId: number,
    role: string,
  ): Promise<Device> {
    const device = await this.ensureDeviceExists({ serialNumber });

    if (role !== 'ADMIN' && device.userId !== userId) {
      this.logger.warn(
        `Device access denied. User ID: ${userId}, device serial: ${serialNumber}`,
      );
      throw new ForbiddenException('Permission denied for accessing device');
    }

    return device;
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
    await this.ensureDeviceExists(params.where);
    return this.repository.update(params);
  }

  async deleteDevice(where: Prisma.DeviceWhereUniqueInput): Promise<Device> {
    await this.ensureDeviceExists(where);
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
    const device = await this.ensureDeviceExists({ id: deviceId });

    if (role !== 'ADMIN') {
      this.logger.error(`Unauthorized deletion payload block. Action denied for non-admin context user: ${userId}`);
      throw new ForbiddenException('Permission denied for removing device');
    }

    const deleted = await this.repository.delete({ id: deviceId });
    this.logger.log(`Administrative process destroyed device record successfully. ID: ${deviceId}`);
    return deleted;
  }

  async toggleDeviceStatus(deviceId: string, userId: number): Promise<Device> {
   const device = await this.ensureDeviceExists({ id: deviceId });

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
  await this.ensureDeviceExists({ serialNumber: deviceSerial });
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
async applyModelVersion(
  deviceId: string,
  targetModelVersionId: string,
) {
  const device =
    await this.repository.findOne({
      id: deviceId,
    });

  if (!device) {
    throw new NotFoundException(
      'DEVICE_NOT_FOUND',
    );
  }

  if (
    device.status !==
    DeviceStatus.ONLINE
  ) {
    throw new ForbiddenException(
      'DEVICE_MUST_BE_ONLINE',
    );
  }

  const targetVersion =
    await this.repository
      .findModelVersionById(
        targetModelVersionId,
      );

  if (!targetVersion) {
    throw new NotFoundException(
      'MODEL_VERSION_NOT_FOUND',
    );
  }

  if (!device.modelVersion) {
    throw new ConflictException( 'DEVICE_HAS_NO_MODEL_VERSION');
  }

  if ( device.modelVersion.modelId !== targetVersion.modelId) {
    throw new ConflictException(
      'TARGET_VERSION_BELONGS_TO_DIFFERENT_MODEL',
    );
  }

  if (device.modelVersionId === targetVersion.id) {
    throw new ConflictException(
      'DEVICE_ALREADY_USES_MODEL_VERSION',
    );
  }

  const previousModelVersionId =device.modelVersionId;

  let databaseSwitched = false;

  try {

    this.logger.log(
      `[MODEL UPDATE] Staging ${targetVersion.modelId}:${targetVersion.version} on device ${device.serialNumber}`,
    );

    const stageResponse =
      await this.commandService
        .sendCommandAndWaitForResponse(
          device.serialNumber,
          'STAGE_MODEL_VERSION',
          {
            model:
              targetVersion.modelId,

            version:
              targetVersion.version,

            schema:
              targetVersion.schema,

            mapping:
              targetVersion.mapping,
          },
          15000,
        );

    if (!stageResponse.success) {
      this.logger.warn(
        `[MODEL UPDATE] Device ${device.serialNumber} rejected staged version ${targetVersion.modelId}:${targetVersion.version}. Error: ${stageResponse.error ?? 'UNKNOWN'}`,
      );

      throw new ConflictException(
        stageResponse.error ??
          'DEVICE_REJECTED_MODEL_VERSION',
      );
    }

    this.logger.log(
      `[MODEL UPDATE] Device ${device.serialNumber} successfully staged ${targetVersion.modelId}:${targetVersion.version}`,
    );
    await this.repository.update({
      where: {
        id: device.id,
      },
      data: {
        modelVersion: {
          connect: {
            id: targetVersion.id,
          },
        },
      },
    });

    databaseSwitched = true;

    this.logger.log(
      `[MODEL UPDATE] Database model version changed to ${targetVersion.modelId}:${targetVersion.version} for device ${device.serialNumber}`,
    );
    await this.dashboardPlugin
      .invalidateDeviceCache(
        device.serialNumber,
      );

    this.logger.log(
      `[MODEL UPDATE] Device cache invalidated for ${device.serialNumber}`,
    );

    const restartResponse =
      await this.commandService
        .sendCommandAndWaitForResponse(
          device.serialNumber,
          'RESTART_WITH_MODEL_VERSION',
          {
            model:
              targetVersion.modelId,

            version:
              targetVersion.version,
          },
          10000,
        );

    if (!restartResponse.success) {
      throw new ConflictException(
        restartResponse.error ??
          'DEVICE_RESTART_REJECTED',
      );
    }

    this.logger.log(
      `[MODEL UPDATE] Device ${device.serialNumber} accepted restart for ${targetVersion.modelId}:${targetVersion.version}`,
    );

    return {
      success: true,
      staged: true,
      restartRequired: true,
      deviceId:
        device.id,
      serialNumber:
        device.serialNumber,
      model:
        targetVersion.modelId,
      version:
        targetVersion.version,
      modelVersionId:
        targetVersion.id,
    };
  } catch (error: any) {
    this.logger.error(`[MODEL UPDATE] Version update failed for device ${device.serialNumber}: ${error.message}`);
    if (
      databaseSwitched &&
      previousModelVersionId
    ) {
      try {
        await this.repository.update({
          where: {
            id: device.id,
          },
          data: {
            modelVersion: {
              connect: {
                id:
                  previousModelVersionId,
              },
            },
          },
        });

        await this.dashboardPlugin
          .invalidateDeviceCache(
            device.serialNumber,
          );

        this.logger.warn(`[MODEL UPDATE] Database rolled back to previous model version for ${device.serialNumber}` );
      } catch (
        rollbackError: any
      ) {
        this.logger.error(
          `[MODEL UPDATE] Rollback failed for ${device.serialNumber}: ${rollbackError.message}`,
        );
      }
    }

    throw error;
  }
}

async markDeviceAsVerified(serialNumber: string, certSerialNumber: string): Promise<Device> {
  await this.ensureDeviceExists({ serialNumber });
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
async getDeviceAttributes(serialNumber: string, userId: number, role: string) {
    await this.assertDeviceAccess(serialNumber, userId, role);

    const attributes = await this.repository.findAttributesBySerialNumber(serialNumber);
    return {
      serialNumber,
      attributes: attributes ?? {},
    };
  }
}
