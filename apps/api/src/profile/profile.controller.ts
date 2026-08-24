import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { AuthUser } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfileService, type UploadedAvatarFile } from './profile.service';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_UPLOAD_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @Throttle(AVATAR_UPLOAD_THROTTLE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: MAX_AVATAR_SIZE_BYTES },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile() file?: UploadedAvatarFile,
  ): Promise<AuthUser> {
    if (!file) {
      throw new BadRequestException('Selecione uma imagem para o perfil.');
    }
    return this.profileService.updateAvatar(user.id, file);
  }
}
