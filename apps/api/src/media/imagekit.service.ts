import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit, { toFile } from '@imagekit/nodejs';

export interface StoredImage {
  externalFileId: string;
  url: string;
}

@Injectable()
export class ImageKitService {
  private readonly client: ImageKit | null;

  constructor(config: ConfigService) {
    const privateKey = config.get<string>('IMAGEKIT_PRIVATE_KEY')?.trim();
    this.client = privateKey ? new ImageKit({ privateKey }) : null;
  }

  async uploadAvatar(input: {
    userId: string;
    buffer: Buffer;
    extension: string;
  }): Promise<StoredImage> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Upload de imagem indisponivel: ImageKit nao esta configurado na API.',
      );
    }

    const fileName = `avatar-${input.userId}.${input.extension}`;
    const uploaded = await this.client.files.upload({
      file: await toFile(input.buffer, fileName),
      fileName,
      folder: '/motoboycity/avatars',
      tags: ['motoboycity', 'avatar'],
      useUniqueFileName: true,
    });

    if (!uploaded.fileId || !uploaded.url) {
      await this.deleteUploadedFileSilently(uploaded.fileId);
      throw new BadGatewayException('O ImageKit nao devolveu os dados completos da imagem.');
    }

    const isDecodedImage =
      uploaded.fileType === 'image' &&
      typeof uploaded.width === 'number' &&
      uploaded.width > 0 &&
      typeof uploaded.height === 'number' &&
      uploaded.height > 0;
    if (!isDecodedImage) {
      await this.deleteUploadedFileSilently(uploaded.fileId);
      throw new BadRequestException('O arquivo enviado nao pode ser decodificado como imagem.');
    }

    return { externalFileId: uploaded.fileId, url: uploaded.url };
  }

  async uploadDriverDocument(input: {
    driverId: string;
    buffer: Buffer;
    extension: string;
    type: string;
  }): Promise<StoredImage> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Upload de documento indisponivel: ImageKit nao esta configurado na API.',
      );
    }
    const fileName = `${input.type.toLowerCase()}-${input.driverId}.${input.extension}`;
    const uploaded = await this.client.files.upload({
      file: await toFile(input.buffer, fileName),
      fileName,
      folder: `/motoboycity/driver-documents/${input.driverId}`,
      tags: ['motoboycity', 'driver-document', input.type],
      useUniqueFileName: true,
    });
    if (!uploaded.fileId || !uploaded.url) {
      await this.deleteUploadedFileSilently(uploaded.fileId);
      throw new BadGatewayException('O ImageKit nao devolveu os dados completos do documento.');
    }
    return { externalFileId: uploaded.fileId, url: uploaded.url };
  }

  async delete(externalFileId: string): Promise<void> {
    if (!this.client) return;
    await this.client.files.delete(externalFileId);
  }

  private async deleteUploadedFileSilently(externalFileId?: string): Promise<void> {
    if (!this.client || !externalFileId) return;
    await this.client.files.delete(externalFileId).catch(() => undefined);
  }
}
