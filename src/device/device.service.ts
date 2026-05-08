import { Injectable,ForbiddenException,NotFoundException , ConflictException, InternalServerErrorException} from "@nestjs/common";
import { Device, Prisma } from "../generated/prisma/client.js";
import { DeviceRepository } from "./device.repository.js";
import {CreateDeviceDto} from './dto/create-device.dto'


@Injectable()
export class DeviceService {
    constructor(
        private repository:DeviceRepository
    ) {}


    async getDevice(where: Prisma.DeviceWhereUniqueInput): Promise<Device| null> {
            return this.repository.findOne(where);
    }
    async getAllDevices(){
            return this.repository.findMany({orderBy: { createdAt: 'desc' }});
        }

    async createDevice(userId:number, data: CreateDeviceDto): Promise<Device> {
        const targetId = data.targetUserId ? data.targetUserId: userId;
        try{
            return await this.repository.create({
            serialNumber: data.serialNumber,
            name: data.name,
            type: data.type,
            user: {
                connect: { id: targetId}
            },
            });
        } catch(error:any)
        {
            if(error.code ==='P2002'){
                    throw new ConflictException('DEVICE_SERIAL_ALREADY_EXISTS');
            }
            throw new InternalServerErrorException('DATABASE_CONNECTION_ERROR');
        }
   
    }

    async updateDevice(params: {
        where: Prisma.DeviceWhereUniqueInput;
        data: Prisma.DeviceUpdateInput;
    }): Promise<Device> {
        return this.repository.update(params);
    }

    async deleteDevice(where: Prisma.DeviceWhereUniqueInput): Promise<Device> {
        return this.repository.delete(where);
    }

    async findAllByUser(userId: number): Promise<Device[]> {
        return this.repository.findMany({
            where: {
            userId: userId, 
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async findDevices(userId: number, role: string, filters: any) {
  // OVO JE KLJUČ: Vidimo šta tačno ulazi u funkciju
  console.log('--- DEBUG START ---');
  console.log('Raw filters object:', filters);
  console.log('Role:', role);
  console.log('Current User ID:', userId);

  const whereClause: any = {};

  // Eksplicitno proveravamo sve varijante jer JS nekad zeza sa tipovima
  const wantsOnlyOwn = 
    filters.own === 'true' || 
    filters.own === true || 
    filters.own === 1;

  if (role !== 'ADMIN' || wantsOnlyOwn) {
    whereClause.userId = userId;
    console.log('STATUS: Filter primenjen! Tražim samo za ID:', userId);
  } else {
    console.log('STATUS: Filter NIJE primenjen (Admin gleda sve)');
  }

  console.log('Final Where Clause:', whereClause);
  console.log('--- DEBUG END ---');

  return this.repository.findMany({
    where: whereClause,
  });
}

    async deleteIfAdmin(deviceId: string, userId: number, role: string) {
        const device = await this.repository.findOne({ id: deviceId });

        if (!device) throw new NotFoundException('Device not found');

        
        if (role !== 'ADMIN') {
            throw new ForbiddenException('Permission denied for removing device');
        }

        return this.repository.delete({ id: deviceId});
    }

    async toggleDeviceStatus(deviceId: string, userId: number): Promise<Device> {
        const device = await this.repository.findOne({ id: deviceId });
        if (!device) throw new NotFoundException('Device not found');

        if (device.userId !== userId) {
            throw new ForbiddenException('Permission denied for toggling device');
        }

        return this.repository.update({
            where:{ id:deviceId },
            data:
            { isActive:!device.isActive },
        });
    }

}