import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { Device, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class DeviceRepository {
  private readonly logger = new Logger(DeviceRepository.name);

  constructor(private prisma: PrismaService) {}

  async findOne(where: Prisma.DeviceWhereUniqueInput) {
    return this.prisma.device.findUnique({
      where,
      include: { 
        user: true, 
        modelVersion: {
          include: { model: true }
        }
      }
    });
  }

  async findMany(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.DeviceWhereUniqueInput;
    where?: Prisma.DeviceWhereInput;
    orderBy?: Prisma.DeviceOrderByWithRelationInput;
    include?: Prisma.DeviceInclude;
  }): Promise<Device[]> {
    const { skip, take, cursor, where, orderBy, include } = params;
    return this.prisma.device.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include: include || { 
        user: true, 
        modelVersion: {
          include: { model: true }
        }
      }
    });
  }
    
  async create(data: Prisma.DeviceCreateInput): Promise<Device> {
    return this.prisma.device.create({ data });
  }

  async update(params: { where: Prisma.DeviceWhereUniqueInput, data: Prisma.DeviceUpdateInput }): Promise<Device> {
    return this.prisma.device.update(params);
  }

  async delete(where: Prisma.DeviceWhereUniqueInput): Promise<Device> {
    return this.prisma.device.delete({ where });
  }

  async createTelemetry(params: { deviceId: string, timestamp: Date, data: Prisma.InputJsonValue; modelVersionId?: string; }) {
    return this.prisma.deviceTelemetry.create({
      data: {
        deviceId: params.deviceId,
        timestamp: params.timestamp,
        data: params.data,
        modelVersionId: params.modelVersionId
      },
    });
  }

  async findTelemetryByDeviceId(deviceId: string) {
    return this.prisma.deviceTelemetry.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });
  }

  async findLatestTelemetryByDeviceId(deviceId: string) {
    return this.prisma.deviceTelemetry.findFirst({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async deleteOldTelemetryForDevice(deviceId: string, keepLast: number) {
    const oldTelemetry = await this.prisma.deviceTelemetry.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      skip: keepLast,
      select: { id: true },
    });

    if (oldTelemetry.length === 0) {
      return { count: 0 };
    }

    const deleteResult = await this.prisma.deviceTelemetry.deleteMany({
      where: {
        id: { in: oldTelemetry.map((item) => item.id) },
      },
    });

    this.logger.debug(`Database rotation pipeline purged ${deleteResult.count} unneeded telemetry logs for device: ${deviceId}`);
    return deleteResult;
  }

  async findModelVersionById(id: string) {
    return this.prisma.modelVersion.findUnique({
      where: { id }
    });
  }

  async findDeviceWithModelVersion(serialNumber: string) {
    return this.prisma.device.findUnique({
      where: { serialNumber },
      include: { modelVersion: true }
    });
  }
  async deleteTelemetryByDeviceId(deviceId: string) {
  return this.prisma.deviceTelemetry.deleteMany({
    where: { deviceId }
  });
}

}