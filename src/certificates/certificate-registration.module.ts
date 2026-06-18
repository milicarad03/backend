// src/certificates/certificate-registration.module.ts

import { Module } from '@nestjs/common';
import { CertificateRegistrationController } from './certificate-registration.controller';
import { CertificateRegistrationService } from './certificate-registration.service';
import { DeviceModule } from 'src/device/device.module';

@Module({
  imports: [DeviceModule],
  controllers: [CertificateRegistrationController],
  providers: [CertificateRegistrationService],
  exports: [CertificateRegistrationService],
})
export class CertificateRegistrationModule {}