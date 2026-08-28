-- AlterEnum
ALTER TYPE "CommandAuditResult" ADD VALUE 'NOOP';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "telemetryStateUpdatedAt" TIMESTAMP(3);
