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
        }): Promise<Device[]> {
        const { skip, take, cursor, where, orderBy } = params;
        return this.prisma.device.findMany({
            skip,
            take,
            cursor,
            where,
            orderBy,
            include:{ user :true }
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
    
}
