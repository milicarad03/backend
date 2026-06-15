-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('UNINITIALIZED', 'ONLINE', 'OFFLINE');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "status" "DeviceStatus" NOT NULL DEFAULT 'UNINITIALIZED';
