import { CertificateRegistrationController } from './certificate-registration.controller';

describe('CertificateRegistrationController', () => {
  let controller: CertificateRegistrationController;
  let serviceMock: any;

  beforeEach(() => {
    serviceMock = {
      registerDeviceCertificate: jest.fn()
    };

    controller = new CertificateRegistrationController(serviceMock);
  });

  
  it('should call service and return result', async () => {
    const dto = {
        csrPem: 'CSR',
        factoryDeviceCertPem: 'CERT',
        factoryProofBase64: 'proof'
    };

    const mockResponse = { deviceId: 'dev-1' };
    serviceMock.registerDeviceCertificate.mockResolvedValue(mockResponse);

    const result = await controller.registerDeviceCertificate(dto as any);


    expect(serviceMock.registerDeviceCertificate).toHaveBeenCalledTimes(1);
    expect(serviceMock.registerDeviceCertificate).toHaveBeenCalledWith(dto);
    
    
    expect(result).toEqual(mockResponse);
    });
});