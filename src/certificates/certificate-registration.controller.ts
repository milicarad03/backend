// src/certificates/certificate-registration.controller.ts

import { Body, Controller, Post } from '@nestjs/common';
import { CertificateRegistrationService } from '../certificates/certificate-registration.service';

export type RegisterCertificateDto = {
  csrPem: string;
  factoryDeviceCertPem: string;
  factoryProofBase64: string;
};

@Controller('device-certificates')
export class CertificateRegistrationController {
  constructor(
    private readonly certificateRegistrationService: CertificateRegistrationService,
  ) {}

  @Post('register')
  async registerDeviceCertificate(@Body() body: RegisterCertificateDto) {
    return this.certificateRegistrationService.registerDeviceCertificate(body);
  }
}