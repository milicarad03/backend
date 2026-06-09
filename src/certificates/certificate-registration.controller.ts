// src/certificates/certificate-registration.controller.ts

import { Body, Controller, Post,Logger } from '@nestjs/common';
import { CertificateRegistrationService } from '../certificates/certificate-registration.service';

export type RegisterCertificateDto = {
  csrPem: string;
  factoryDeviceCertPem: string;
  factoryProofBase64: string;
};

@Controller('device-certificates')
export class CertificateRegistrationController {
  private readonly logger = new Logger(CertificateRegistrationController.name);
  constructor(
    private readonly certificateRegistrationService: CertificateRegistrationService,
  ) {}

  @Post('register')
  async registerDeviceCertificate(@Body() body: RegisterCertificateDto) {
    this.logger.log('HTTP POST /device-certificates/register - Incoming device registration request');
    return this.certificateRegistrationService.registerDeviceCertificate(body);
  }
}