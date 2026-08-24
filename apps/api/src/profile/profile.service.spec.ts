import { BadRequestException } from '@nestjs/common';
import { ImageKitService } from '../media/imagekit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService, type UploadedAvatarFile } from './profile.service';

describe('ProfileService', () => {
  const uploadedAvatar = {
    externalFileId: 'imagekit-new-avatar',
    url: 'https://ik.imagekit.io/motoboycity/avatar-new.jpg',
  };
  const updatedProfile = {
    id: 'user-1',
    name: 'Joao Motoboy',
    email: 'joao@example.com',
    type: 'DRIVER' as const,
    avatarUrl: uploadedAvatar.url,
  };

  let tx: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let prisma: { $transaction: jest.Mock };
  let imageKit: {
    uploadAvatar: jest.Mock;
    delete: jest.Mock;
  };
  let service: ProfileService;

  beforeEach(() => {
    tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          avatarExternalFileId: 'imagekit-old-avatar',
        }),
        update: jest.fn().mockResolvedValue(updatedProfile),
      },
    };
    prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    imageKit = {
      uploadAvatar: jest.fn().mockResolvedValue(uploadedAvatar),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new ProfileService(
      prisma as unknown as PrismaService,
      imageKit as unknown as ImageKitService,
    );
  });

  it('valida, envia e substitui o avatar anterior', async () => {
    const result = await service.updateAvatar('user-1', validImageFile());

    expect(result).toEqual(updatedProfile);
    expect(imageKit.uploadAvatar).toHaveBeenCalledWith({
      userId: 'user-1',
      buffer: expect.any(Buffer),
      extension: 'png',
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        avatarExternalFileId: uploadedAvatar.externalFileId,
        avatarUrl: uploadedAvatar.url,
      },
      select: {
        id: true,
        name: true,
        email: true,
        type: true,
        avatarUrl: true,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(imageKit.delete).toHaveBeenCalledWith('imagekit-old-avatar');
  });

  it('rejeita conteudo que nao corresponde a uma imagem permitida', async () => {
    const buffer = Buffer.from('nao-e-imagem');

    await expect(
      service.updateAvatar('user-1', {
        buffer,
        mimetype: 'image/jpeg',
        originalname: 'avatar.jpg',
        size: buffer.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(imageKit.uploadAvatar).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejeita arquivo curto que apenas imita o cabecalho JPEG', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    await expect(
      service.updateAvatar('user-1', {
        buffer,
        mimetype: 'image/jpeg',
        originalname: 'avatar.jpg',
        size: buffer.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(imageKit.uploadAvatar).not.toHaveBeenCalled();
  });

  it('remove a imagem nova quando o banco rejeita a atualizacao', async () => {
    prisma.$transaction.mockRejectedValue(new Error('database unavailable'));

    await expect(service.updateAvatar('user-1', validImageFile())).rejects.toThrow(
      'database unavailable',
    );

    expect(imageKit.delete).toHaveBeenCalledWith(uploadedAvatar.externalFileId);
    expect(imageKit.delete).not.toHaveBeenCalledWith('imagekit-old-avatar');
  });

  it('repete a transacao serializavel em conflito concorrente', async () => {
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));

    await expect(service.updateAvatar('user-1', validImageFile())).resolves.toEqual(updatedProfile);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(imageKit.uploadAvatar).toHaveBeenCalledTimes(1);
    expect(imageKit.delete).toHaveBeenCalledWith('imagekit-old-avatar');
    expect(imageKit.delete).not.toHaveBeenCalledWith(uploadedAvatar.externalFileId);
  });

  function validImageFile(): UploadedAvatarFile {
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    return {
      buffer,
      mimetype: 'image/png',
      originalname: 'avatar.png',
      size: buffer.length,
    };
  }
});
