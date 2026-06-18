/*
  Warnings:

  - A unique constraint covering the columns `[certSerialNumber]` on the table `Device` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "certSerialNumber" TEXT,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Device_certSerialNumber_key" ON "Device"("certSerialNumber");
