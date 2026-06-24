import { CertificateRegistrationController } from './certificate-registration.controller';

describe('CertificateRegistrationController', () => {
  let controller: CertificateRegistrationController;
  let serviceMock: any;
  let loggerSpy: jest.SpyInstance;

  beforeEach(() => {
    serviceMock = {
      registerDeviceCertificate: jest.fn()
    };

    controller = new CertificateRegistrationController(serviceMock);
    loggerSpy = jest.spyOn(controller['logger'], 'log').mockImplementation();
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

    it('should propagate error if service fails', async () => {
    const dto = { csrPem: 'CSR', factoryDeviceCertPem: 'CERT', factoryProofBase64: 'proof' };
    serviceMock.registerDeviceCertificate.mockRejectedValue(new Error('Invalid CSR'));

    await expect(controller.registerDeviceCertificate(dto)).rejects.toThrow('Invalid CSR');
  });


  it('should throw error if body is incomplete', async () => {
   
    serviceMock.registerDeviceCertificate.mockRejectedValue(new Error('Missing fields'));
    
    await expect(controller.registerDeviceCertificate({} as any)).rejects.toThrow('Missing fields');
  });

  it('should propagate 503 error if service is unavailable', async () => {
    const dto = { csrPem: 'CSR', factoryDeviceCertPem: 'CERT', factoryProofBase64: 'proof' };
    serviceMock.registerDeviceCertificate.mockRejectedValue(new Error('Service Unavailable'));

    await expect(controller.registerDeviceCertificate(dto)).rejects.toThrow('Service Unavailable');
  });
  
  it('should log error if service fails', async () => {
  
    const errorSpy = jest.spyOn(controller['logger'], 'error').mockImplementation();
    
    serviceMock.registerDeviceCertificate.mockRejectedValue(new Error('Critical failure'));

    try {
      await controller.registerDeviceCertificate({} as any);
    } catch (e) {
     
      expect(errorSpy).toHaveBeenCalled();
    }
  });
});