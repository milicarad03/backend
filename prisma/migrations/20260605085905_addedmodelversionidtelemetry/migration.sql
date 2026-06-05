-- AddForeignKey
ALTER TABLE "DeviceTelemetry" ADD CONSTRAINT "DeviceTelemetry_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
