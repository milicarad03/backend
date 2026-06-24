// src/certificates/certificate-registration.service.ts

import { BadRequestException, Injectable, Logger, InternalServerErrorException} from '@nestjs/common';
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
import { DeviceService } from 'src/device/device.service';

@Injectable()
export class CertificateRegistrationService {
  private readonly logger = new Logger(CertificateRegistrationService.name);
  private readonly factoryCaCertPath = 'certs/factory/factory-ca.crt';
  private readonly operationalCaCertPath =
    'certs/operational/operational-ca.crt';
  private readonly operationalCaKeyPath =
    'certs/operational/operational-ca.key';
   

  private extractCommonNameFromSubject(subject: string): string | null {
    const match = subject.match(/CN\s*=\s*([^,\n/]+)/);

    return match ? match[1].trim() : null;
  }
  
  constructor(
  private readonly deviceService: DeviceService 
) {}

  async registerDeviceCertificate(dto: RegisterCertificateDto) {
    this.logger.log('Received device certificate registration request.');
    const workDir = mkdtempSync(join(tmpdir(), 'device-registration-'));
    this.logger.debug(`Created isolated workspace directory: ${workDir}`);

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
        this.logger.debug(`Verifying factory device certificate against CA: ${this.factoryCaCertPath}`);
        execFileSync('openssl', [
          'verify',
          '-CAfile',
          this.factoryCaCertPath,
          factoryCertPath,
        ]);
      } catch (opensslError: any) {
        this.logger.error(`Factory certificate verification failed. OpenSSL Output: ${opensslError.stderr?.toString() || opensslError.message}`);
        throw new BadRequestException('INVALID_FACTORY_DEVICE_CERT');
      }

      this.logger.debug('Extracting public key from factory device certificate...');

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
        this.logger.debug('Verifying cryptographic proof signature using extracted public key...');
        execFileSync('openssl', [
          'dgst',
          '-sha256',
          '-verify',
          factoryPublicKeyPath,
          '-signature',
          proofPath,
          csrPath,
        ]);
      } catch (opensslError: any) {
        this.logger.error(`Cryptographic proof signature validation failed. OpenSSL Output: ${opensslError.stderr?.toString() || opensslError.message}`);
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
        this.logger.warn(`Failed to extract Common Name (CN). FactoryID: ${factoryDeviceId}, CsrID: ${csrDeviceId}`);
        throw new BadRequestException('DEVICE_ID_NOT_FOUND_IN_CERT_OR_CSR');
      }

      if (factoryDeviceId !== csrDeviceId) {
        this.logger.warn(`Identity mismatch detected! Factory CN: ${factoryDeviceId}, CSR CN: ${csrDeviceId}`);
        throw new BadRequestException('DEVICE_ID_MISMATCH');
      }
      const deviceId=csrDeviceId;
      this.logger.log(`Device identity verified successfully for ID: ${deviceId}`);
      let certSerialNumber: string;


      try {
        this.logger.debug(`Signing CSR and generating operational certificate using Operational CA...`);
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
      const serialOutput = execFileSync('openssl', ['x509', '-in', operationalDeviceCertPath, '-noout', '-serial']).toString();
      //const certSerialNumber = serialOutput.split('=')[1].trim();
      certSerialNumber = serialOutput.split('=')[1]?.trim();

      //await this.deviceService.markDeviceAsVerified(deviceId, certSerialNumber);
      } catch (opensslError: any) {
        this.logger.error(`Failed to sign operational certificate. OpenSSL Output: ${opensslError.stderr?.toString() || opensslError.message}`);
        throw new BadRequestException('OPERATIONAL_SIGNING_FAILED');
      }
     

      if (!certSerialNumber) {
    
        throw new InternalServerErrorException('CERTIFICATE_SERIAL_MISSING'); 
      }


     try {
       // const serialOutput = execFileSync('openssl', ['x509', '-in', operationalDeviceCertPath, '-noout', '-serial']).toString();
       // const certSerialNumber = serialOutput.split('=')[1].trim();
      
        await this.deviceService.markDeviceAsVerified(deviceId, certSerialNumber);
      } catch (dbError: any) {
        this.logger.error(`Database update failed: ${dbError.message}`);
        throw new InternalServerErrorException('DB_FAILED'); 
      }
          
          

      const operationalDeviceCertPem = readFileSync(
        operationalDeviceCertPath,
        'utf8',
      );

      const operationalCaCertPem = readFileSync(
        this.operationalCaCertPath,
        'utf8',
      );
      this.logger.log(`Operational certificate successfully issued for device: ${deviceId}`);

      return {
        deviceId,
        operationalDeviceCertPem,
        operationalCaCertPem,
      };
    } catch (error: any) {
      this.logger.error(`Unhandled exception during device registration flow: ${error.message}`, error.stack);
      throw error;
    } finally {
      this.logger.debug(`Cleaning up and purging workspace directory: ${workDir}`);
      rmSync(workDir, {
        recursive: true,
        force: true,
      });
    }
  }
}