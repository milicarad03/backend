// src/certificates/certificate-registration.service.ts

import { BadRequestException, Injectable } from '@nestjs/common';
import { execFileSync } from 'child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { RegisterCertificateDto } from './certificate-registration.controller';

@Injectable()
export class CertificateRegistrationService {
  private readonly factoryCaCertPath = 'certs/factory/factory-ca.crt';
  private readonly operationalCaCertPath =
    'certs/operational/operational-ca.crt';
  private readonly operationalCaKeyPath =
    'certs/operational/operational-ca.key';

  private extractCommonNameFromSubject(subject: string): string | null {
    const match = subject.match(/CN\s*=\s*([^,\n/]+)/);

    return match ? match[1].trim() : null;
  }

  async registerDeviceCertificate(dto: RegisterCertificateDto) {
    const workDir = mkdtempSync(join(tmpdir(), 'device-registration-'));

    try {
      const csrPath = join(workDir, 'operational-device.csr');
      const factoryCertPath = join(workDir, 'factory-device.crt');
      const proofPath = join(workDir, 'factory-proof.sig');
      const factoryPublicKeyPath = join(
        workDir,
        'factory-device-public.key',
      );
      const operationalDeviceCertPath = join(
        workDir,
        'operational-device.crt',
      );

      writeFileSync(csrPath, dto.csrPem);
      writeFileSync(factoryCertPath, dto.factoryDeviceCertPem);
      writeFileSync(
        proofPath,
        Buffer.from(dto.factoryProofBase64, 'base64'),
      );

      try {
        execFileSync('openssl', [
          'verify',
          '-CAfile',
          this.factoryCaCertPath,
          factoryCertPath,
        ]);
      } catch {
        throw new BadRequestException('INVALID_FACTORY_DEVICE_CERT');
      }

      execFileSync('openssl', [
        'x509',
        '-in',
        factoryCertPath,
        '-pubkey',
        '-noout',
        '-out',
        factoryPublicKeyPath,
      ]);

      try {
        execFileSync('openssl', [
          'dgst',
          '-sha256',
          '-verify',
          factoryPublicKeyPath,
          '-signature',
          proofPath,
          csrPath,
        ]);
      } catch {
        throw new BadRequestException('INVALID_FACTORY_PROOF');
      }

      const factoryCertSubject = execFileSync('openssl', [
        'x509',
        '-in',
        factoryCertPath,
        '-noout',
        '-subject',
      ]).toString();

      const csrSubject = execFileSync('openssl', [
        'req',
        '-in',
        csrPath,
        '-noout',
        '-subject',
      ]).toString();

      const factoryDeviceId =
        this.extractCommonNameFromSubject(factoryCertSubject);

      const csrDeviceId =
        this.extractCommonNameFromSubject(csrSubject);

      if (!factoryDeviceId || !csrDeviceId) {
        throw new BadRequestException(
          'DEVICE_ID_NOT_FOUND_IN_CERT_OR_CSR',
        );
      }

      if (factoryDeviceId !== csrDeviceId) {
        throw new BadRequestException('DEVICE_ID_MISMATCH');
      }
      const deviceId=csrDeviceId;


      execFileSync('openssl', [
        'x509',
        '-req',
        '-in',
        csrPath,
        '-CA',
        this.operationalCaCertPath,
        '-CAkey',
        this.operationalCaKeyPath,
        '-CAcreateserial',
        '-out',
        operationalDeviceCertPath,
        '-days',
        '365',
        '-sha256',
      ]);

      const operationalDeviceCertPem = readFileSync(
        operationalDeviceCertPath,
        'utf8',
      );

      const operationalCaCertPem = readFileSync(
        this.operationalCaCertPath,
        'utf8',
      );

      return {
        deviceId,
        operationalDeviceCertPem,
        operationalCaCertPem,
      };
    } finally {
      rmSync(workDir, {
        recursive: true,
        force: true,
      });
    }
  }
}