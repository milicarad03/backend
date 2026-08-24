-- CreateEnum
CREATE TYPE "TelemetryState" AS ENUM ('ACTIVE', 'IDLE');

-- CreateEnum
CREATE TYPE "CommandAuditResult" AS ENUM ('PENDING', 'SUCCESS', 'FAILURE');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "telemetryState" "TelemetryState" NOT NULL DEFAULT 'IDLE';

-- CreateTable
CREATE TABLE "CommandAudit" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "payload" JSONB,
    "correlationId" TEXT NOT NULL,
    "result" "CommandAuditResult" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CommandAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommandAudit_correlationId_key" ON "CommandAudit"("correlationId");

-- CreateIndex
CREATE INDEX "CommandAudit_deviceId_createdAt_idx" ON "CommandAudit"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "CommandAudit_userId_createdAt_idx" ON "CommandAudit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommandAudit_result_createdAt_idx" ON "CommandAudit"("result", "createdAt");

-- AddForeignKey
ALTER TABLE "CommandAudit" ADD CONSTRAINT "CommandAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
