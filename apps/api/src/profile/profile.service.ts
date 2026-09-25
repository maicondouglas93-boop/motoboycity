import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@motoboycity/types';
import { Prisma } from '@prisma/client';
import { ImageKitService } from '../media/imagekit.service';
import { detectSupportedImage, type UploadedImageFile } from '../media/supported-image';
import { PrismaService } from '../prisma/prisma.service';

const MAX_TRANSACTION_ATTEMPTS = 3;

export type UploadedAvatarFile = UploadedImageFile;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageKit: ImageKitService,
  ) {}

  async updateAvatar(userId: string, file: UploadedAvatarFile): Promise<AuthUser> {
    const image = detectSupportedImage(file);
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
