import { CertificateRegistrationService } from "./certificate-registration.service";
import { BadRequestException } from "@nestjs/common";


jest.mock("child_process", () => ({
  execFileSync: jest.fn()
}));

jest.mock("fs", () => ({
  mkdtempSync: jest.fn(() => "/tmp/test-dir"),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(() => "CERT_DATA"),
  rmSync: jest.fn()
}));

import { execFileSync } from "child_process";

describe("CertificateRegistrationService", () => {
  let service: CertificateRegistrationService;
  let deviceServiceMock: any;

  beforeEach(() => {
    deviceServiceMock = {
      markDeviceAsVerified: jest.fn()
    };

    service = new CertificateRegistrationService(deviceServiceMock);
    jest.clearAllMocks();
  });

    afterEach(() => {
        jest.restoreAllMocks();
    })


  const validDto = {
    csrPem: "CSR_DATA",
    factoryDeviceCertPem: "FACTORY_CERT",
    factoryProofBase64: Buffer.from("proof").toString("base64")
  };

  function mockOpenSSLSuccess() {
    (execFileSync as jest.Mock).mockImplementation((cmd, args) => {
      if (args.includes("-subject")) {
        return "subject=CN=device-123\n";
      }
      if (args.includes("-serial")) {
        return "serial=ABC123\n";
      }


      return "";
    });
  }
  function mockOpenSSLFail() {
    (execFileSync as jest.Mock).mockImplementation((cmd, args) => {
    
      if (args.includes("-req")) throw new Error("openssl signing error");
      
      if (args.includes("-subject")) return "subject=CN=device-123\n";
      return "";
    });
  }


  it("should register device successfully", async () => {
    mockOpenSSLSuccess();

    const result = await service.registerDeviceCertificate(validDto);

    expect(result.deviceId).toBe("device-123");
    expect(result.operationalDeviceCertPem).toBe("CERT_DATA");
    expect(deviceServiceMock.markDeviceAsVerified).toHaveBeenCalledWith("device-123", "ABC123");
  });


  it("should throw on invalid factory certificate", async () => {
    (execFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("openssl error");
    });

    await expect(service.registerDeviceCertificate(validDto)).rejects.toThrow(BadRequestException);
  });

  it("should throw on invalid proof signature", async () => {
    (execFileSync as jest.Mock).mockImplementation((cmd, args) => {
        if (args.includes("dgst")) {
        throw new Error("openssl error"); 
        }

        if (args.includes("-subject")) {
        return "subject=CN=device-123\n";
        }

        return "";
    });

    await expect(service.registerDeviceCertificate(validDto)).rejects.toThrow("INVALID_FACTORY_PROOF"); 
    });

 


  it("should throw when device IDs do not match", async () => {
    (execFileSync as jest.Mock).mockImplementation((cmd, args) => {
      if (args.includes("x509") && args.includes("-subject")) {
        return "subject=CN=device-123\n";
      }
      if (args.includes("req")) {
        return "subject=CN=device-999\n";
      }
      return "";
    });

    await expect(
      service.registerDeviceCertificate(validDto)
    ).rejects.toThrow("DEVICE_ID_MISMATCH");
  });


  it("should throw if CN not found", async () => {
    (execFileSync as jest.Mock).mockImplementation(() => {
      return "subject=O=noCN\n";
    });

    await expect(
      service.registerDeviceCertificate(validDto)
    ).rejects.toThrow("DEVICE_ID_NOT_FOUND_IN_CERT_OR_CSR");
  });



  it("should throw when operational signing fails", async () => {
    (execFileSync as jest.Mock).mockImplementation((cmd, args) => {
        if (args.includes("-req")) {
        throw new Error("openssl signing error"); 
        }

        if (args.includes("-subject")) {
        return "subject=CN=device-123\n";
        }

        return "";
    });

    await expect(
        service.registerDeviceCertificate(validDto)
    ).rejects.toThrow("OPERATIONAL_SIGNING_FAILED"); 
    });

 
  it("should cleanup temp directory", async () => {
    const { rmSync } = require("fs");

    mockOpenSSLSuccess();

    await service.registerDeviceCertificate(validDto);

    expect(rmSync).toHaveBeenCalled();
  });
 
  it("should cleanup even on failure", async () => {
    const { rmSync } = require("fs");

    (execFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("fail");
    });

    await expect(
        service.registerDeviceCertificate(validDto)
    ).rejects.toThrow();

    expect(rmSync).toHaveBeenCalled();
    });
    it("should throw if CA file is missing/inaccessible", async () => {
      
      (execFileSync as jest.Mock).mockImplementation((cmd, args) => {
          if (args.includes("-CAfile")) {
              throw new Error("Unable to open file");
          }
      });

      await expect(service.registerDeviceCertificate(validDto))
          .rejects.toThrow(BadRequestException);
  });

  
  it("should throw if reading certificate fails", async () => {
    mockOpenSSLSuccess();

    const fs = require("fs");
    fs.readFileSync.mockImplementationOnce(() => {
      throw new Error("read fail");
    });

    await expect(
      service.registerDeviceCertificate(validDto)
    ).rejects.toThrow("read fail");
  });

  it("should throw OPERATIONAL_SIGNING_FAILED on OpenSSL error", async () => {
      mockOpenSSLFail(); 
      await expect(service.registerDeviceCertificate(validDto))
          .rejects.toThrow("OPERATIONAL_SIGNING_FAILED");
  });


  it("should throw DB_FAILED on DB error", async () => {
      mockOpenSSLSuccess(); 
      deviceServiceMock.markDeviceAsVerified.mockRejectedValue(new Error("DB FAIL")); 
      await expect(service.registerDeviceCertificate(validDto))
          .rejects.toThrow("DB_FAILED");
  });

  it("should throw if writing to temp directory fails", async () => {
      const fs = require("fs");
      fs.writeFileSync.mockImplementationOnce(() => {
          throw new Error("Disk full or permission denied");
      });

      await expect(service.registerDeviceCertificate(validDto))
          .rejects.toThrow("Disk full or permission denied");
  });

  it("should throw error if serial number is missing from OpenSSL output", async () => {
      (execFileSync as jest.Mock).mockImplementation((cmd, args) => {
          
          if (args.includes("-req")) return "success"; 
          
          if (args.includes("-subject")) return "subject=CN=device-123\n";
          
      
          if (args.includes("-serial")) return "serial=\n"; 
          
          return "";
      });

      await expect(service.registerDeviceCertificate(validDto))
          .rejects.toThrow("CERTIFICATE_SERIAL_MISSING"); 
  });

  it("should log stderr when OpenSSL fails", async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      
      (execFileSync as jest.Mock).mockImplementation(() => {
          const error = new Error("openssl failed");
          (error as any).stderr = Buffer.from("CRITICAL_OSSL_ERROR");
          throw error;
      });

      try {
          await service.registerDeviceCertificate(validDto);
      } catch (e) {
          expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining("CRITICAL_OSSL_ERROR"));
      }
  });
  it("should propagate error if temp directory creation fails", async () => {
      const fs = require("fs");
      fs.mkdtempSync.mockImplementationOnce(() => {
          throw new Error("EACCES: permission denied");
      });

      await expect(service.registerDeviceCertificate(validDto))
          .rejects.toThrow("EACCES: permission denied");
  });
  it("should propagate error if temp directory creation fails", async () => {
      const fs = require("fs");
      fs.mkdtempSync.mockImplementationOnce(() => {
          throw new Error("EACCES: permission denied");
      });

      await expect(service.registerDeviceCertificate(validDto))
          .rejects.toThrow("EACCES: permission denied");
  });
});