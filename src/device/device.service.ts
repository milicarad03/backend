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

        console.log('--- DEBUG START ---');
        console.log('Raw filters object:', filters);
        console.log('Role:', role);
        console.log('Current User ID:', userId);

        const whereClause: any = {};

        if (role !== 'ADMIN') {
            whereClause.userId = userId;
            console.log('STATUS: Filter primenjen! Tražim samo za ID:', userId);
        } else if (role === 'ADMIN' && filters.userIds && filters.userIds.length > 0) {
            whereClause.userId = {
                    in: filters.userIds.map((id: any) => Number(id))
                };
        console.log('STATUS: Admin gleda uređaje korisnika:', filters.targetUserId);
        }
        else {
            console.log('STATUS: Admin gleda kompletnu bazu.');
        }


        if (filters.type && filters.type.length > 0 ) {
           whereClause.type = {
                    in: filters.type
                };
        }
        if(filters.search){
            whereClause.OR = [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { serialNumber: { contains: filters.search, mode: 'insensitive' } }
        ];
        }
      

        if (filters.status && filters.status !== 'ALL') {
            whereClause.status = filters.status;
        }
       

        console.log('Final Where Clause:', whereClause);
        console.log('--- DEBUG END ---');
        const devices = await this.repository.findMany({
            where: whereClause,
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