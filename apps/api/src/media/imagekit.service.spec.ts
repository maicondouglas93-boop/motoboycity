import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageKitService } from './imagekit.service';

describe('ImageKitService', () => {
  let upload: jest.Mock;
  let remove: jest.Mock;
  let service: ImageKitService;

  beforeEach(() => {
    upload = jest.fn();
    remove = jest.fn().mockResolvedValue(undefined);
    service = new ImageKitService({
      get: jest.fn().mockReturnValue('private-key'),
    } as unknown as ConfigService);
    Object.defineProperty(service, 'client', {
      value: { files: { upload, delete: remove } },
    });
  });

  it('aceita somente resposta que o provedor decodificou como imagem', async () => {
    upload.mockResolvedValue({
      fileId: 'file-1',
      url: 'https://ik.imagekit.io/motoboycity/avatar.jpg',
      fileType: 'image',
      width: 512,
      height: 512,
    });

    await expect(
      service.uploadAvatar({ userId: 'user-1', buffer: Buffer.from('image'), extension: 'jpg' }),
    ).resolves.toEqual({
      externalFileId: 'file-1',
      url: 'https://ik.imagekit.io/motoboycity/avatar.jpg',
    });

    expect(remove).not.toHaveBeenCalled();
  });

  it('remove e rejeita arquivo que o provedor classificou como nao-imagem', async () => {
    upload.mockResolvedValue({
      fileId: 'file-2',
      url: 'https://ik.imagekit.io/motoboycity/fake.jpg',
      fileType: 'non-image',
    });

    await expect(
      service.uploadAvatar({ userId: 'user-1', buffer: Buffer.from('fake'), extension: 'jpg' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(remove).toHaveBeenCalledWith('file-2');
  });

  it('remove arquivo quando a resposta do provedor vem incompleta', async () => {
    upload.mockResolvedValue({ fileId: 'file-3', fileType: 'image', width: 10, height: 10 });

    await expect(
      service.uploadAvatar({ userId: 'user-1', buffer: Buffer.from('image'), extension: 'png' }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(remove).toHaveBeenCalledWith('file-3');
  });

  it('falha de forma explicita quando a chave privada nao esta configurada', async () => {
    const unconfigured = new ImageKitService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    await expect(
      unconfigured.uploadAvatar({
        userId: 'user-1',
        buffer: Buffer.from('image'),
        extension: 'jpg',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
