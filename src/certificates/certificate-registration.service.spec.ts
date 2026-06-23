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
  //CLEANUP I AKO FAILUJE 
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
});