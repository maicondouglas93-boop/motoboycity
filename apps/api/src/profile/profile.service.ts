import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@motoboycity/types';
import { Prisma } from '@prisma/client';
import { ImageKitService } from '../media/imagekit.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_TRANSACTION_ATTEMPTS = 3;
const MAX_AVATAR_DIMENSION = 4096;
const MAX_AVATAR_PIXELS = MAX_AVATAR_DIMENSION * MAX_AVATAR_DIMENSION;

export interface UploadedAvatarFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

interface SupportedImage {
  extension: 'jpg' | 'png' | 'webp';
}

interface ImageDimensions {
  width: number;
  height: number;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageKit: ImageKitService,
  ) {}

  async updateAvatar(userId: string, file: UploadedAvatarFile): Promise<AuthUser> {
    const image = this.detectSupportedImage(file);
    const uploaded = await this.imageKit.uploadAvatar({
      userId,
      buffer: file.buffer,
      extension: image.extension,
    });

    let previousExternalFileId: string | null = null;
    let profile: AuthUser | null = null;

    try {
      for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
        try {
          const result = await this.prisma.$transaction(
            async (tx) => {
              const current = await tx.user.findUnique({
                where: { id: userId },
                select: { avatarExternalFileId: true },
              });
              if (!current) throw new NotFoundException('Usuario nao encontrado.');

              const updated = await tx.user.update({
                where: { id: userId },
                data: {
                  avatarExternalFileId: uploaded.externalFileId,
                  avatarUrl: uploaded.url,
                },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  type: true,
                  avatarUrl: true,
                },
              });

              return { previousExternalFileId: current.avatarExternalFileId, profile: updated };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );

          previousExternalFileId = result.previousExternalFileId;
          profile = result.profile;
          break;
        } catch (error) {
          if (this.isPrismaErrorCode(error, 'P2034') && attempt < MAX_TRANSACTION_ATTEMPTS) {
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      await this.deleteWithoutBreakingRequest(uploaded.externalFileId, 'imagem nova apos falha');
      throw error;
    }

    if (!profile) {
      await this.deleteWithoutBreakingRequest(uploaded.externalFileId, 'imagem nova sem perfil');
      throw new BadRequestException('Nao foi possivel atualizar a foto do perfil.');
    }

    if (previousExternalFileId && previousExternalFileId !== uploaded.externalFileId) {
      await this.deleteWithoutBreakingRequest(previousExternalFileId, 'avatar substituido');
    }

    return profile;
  }

  private detectSupportedImage(file: UploadedAvatarFile): SupportedImage {
    if (!file.buffer.length || file.size !== file.buffer.length) {
      throw new BadRequestException('Arquivo de imagem vazio ou incompleto.');
    }

    const bytes = file.buffer;
    const jpeg = this.readJpegDimensions(bytes);
    if (jpeg && this.hasSafeDimensions(jpeg)) return { extension: 'jpg' };

    const png = this.readPngDimensions(bytes);
    if (png && this.hasSafeDimensions(png)) return { extension: 'png' };

    const webp = this.readWebpDimensions(bytes);
    if (webp && this.hasSafeDimensions(webp)) return { extension: 'webp' };

    throw new BadRequestException(
      'Use uma imagem JPEG, PNG ou WebP valida, com no maximo 4096 x 4096 pixels.',
    );
  }

  private readJpegDimensions(bytes: Buffer): ImageDimensions | null {
    const hasStart = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
    const hasEnd =
      bytes.length >= 4 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    if (!hasStart || !hasEnd) return null;

    const startOfFrameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let offset = 2;

    while (offset < bytes.length - 1) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return null;

      const marker = bytes.readUInt8(offset);
      offset += 1;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > bytes.length) return null;

      const segmentLength = bytes.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
      if (startOfFrameMarkers.has(marker)) {
        if (segmentLength < 7) return null;
        return {
          height: bytes.readUInt16BE(offset + 3),
          width: bytes.readUInt16BE(offset + 5),
        };
      }
      offset += segmentLength;
    }

    return null;
  }

  private readPngDimensions(bytes: Buffer): ImageDimensions | null {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (
      bytes.length < 45 ||
      !signature.every((value, index) => bytes[index] === value) ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString('ascii', 12, 16) !== 'IHDR'
    ) {
      return null;
    }

    const dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const chunkLength = bytes.readUInt32BE(offset);
      const chunkEnd = offset + 12 + chunkLength;
      if (chunkEnd > bytes.length) return null;
      const chunkType = bytes.toString('ascii', offset + 4, offset + 8);
      if (chunkType === 'IEND') {
        return chunkLength === 0 && chunkEnd === bytes.length ? dimensions : null;
      }
      offset = chunkEnd;
    }

    return null;
  }

  private readWebpDimensions(bytes: Buffer): ImageDimensions | null {
    if (
      bytes.length < 25 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.readUInt32LE(4) + 8 !== bytes.length ||
      bytes.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      return null;
    }

    const chunkType = bytes.toString('ascii', 12, 16);
    const chunkLength = bytes.readUInt32LE(16);
    if (20 + chunkLength > bytes.length) return null;

    if (chunkType === 'VP8X' && chunkLength >= 10) {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }

    if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[20] === 0x2f) {
      const byte21 = bytes.readUInt8(21);
      const byte22 = bytes.readUInt8(22);
      const byte23 = bytes.readUInt8(23);
      const byte24 = bytes.readUInt8(24);
      return {
        width: 1 + byte21 + ((byte22 & 0x3f) << 8),
        height: 1 + (byte22 >> 6) + (byte23 << 2) + ((byte24 & 0x0f) << 10),
      };
    }

    if (
      chunkType === 'VP8 ' &&
      chunkLength >= 10 &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }

    return null;
  }

  private hasSafeDimensions({ width, height }: ImageDimensions): boolean {
    return (
      width > 0 &&
      height > 0 &&
      width <= MAX_AVATAR_DIMENSION &&
      height <= MAX_AVATAR_DIMENSION &&
      width * height <= MAX_AVATAR_PIXELS
    );
  }

  private async deleteWithoutBreakingRequest(
    externalFileId: string,
    context: string,
  ): Promise<void> {
    try {
      await this.imageKit.delete(externalFileId);
    } catch {
      this.logger.warn(`Nao foi possivel remover ${context} do ImageKit.`);
    }
  }

  private isPrismaErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
