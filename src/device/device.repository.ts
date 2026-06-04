import { Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { Device, Prisma } from "../generated/prisma/client.js";




@Injectable()
export class DeviceRepository {
  constructor(private prisma: PrismaService) {}


    async findOne(where: Prisma.DeviceWhereUniqueInput): Promise<Device| null> {
        return this.prisma.device.findUnique({
            where,
            include:{ user:true }

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
            include: include || { user: true }
        });
    }
    
    async create(data: Prisma.DeviceCreateInput): Promise<Device>{
        return this.prisma.device.create({data});
    }

    async update(params:{
       where:Prisma.DeviceWhereUniqueInput,
       data:Prisma.DeviceUpdateInput
        }):Promise<Device> {
            return this.prisma.device.update(params);
    }

    async delete(where:Prisma.DeviceWhereUniqueInput):Promise<Device> {
            return this.prisma.device.delete({where});
    }
    async createTelemetry(params:{
        deviceId:string,
        timestamp:Date,
        data: Prisma.InputJsonValue;
    }){
        return this.prisma.deviceTelemetry.create({
            data:{
                deviceId: params.deviceId,
                timestamp: params.timestamp,
                data: params.data,
            },
        });
    }
    async findTelemetryByDeviceId(deviceId: string) {
        return this.prisma.deviceTelemetry.findMany({
            where: {
            deviceId,
            },
            orderBy: {
            timestamp: 'desc',
            },
            take: 5,
        });
    }

    async findLatestTelemetryByDeviceId(deviceId: string) {
        return this.prisma.deviceTelemetry.findFirst({
            where: {
            deviceId,
            },
            orderBy: {
            timestamp: 'desc',
            },
        });
    }
    async deleteOldTelemetryForDevice(deviceId: string, keepLast: number) {
    const oldTelemetry = await this.prisma.deviceTelemetry.findMany({
        where: {
        deviceId,
        },
        orderBy: {
        timestamp: 'desc',
        },
        skip: keepLast,
        select: {
        id: true,
        },
    });

    if (oldTelemetry.length === 0) {
        return { count: 0 };
    }

    return this.prisma.deviceTelemetry.deleteMany({
        where: {
        id: {
            in: oldTelemetry.map((item) => item.id),
        },
        },
    });
    }
    
}
