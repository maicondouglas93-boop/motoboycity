import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { DriverScheduleView } from '@motoboycity/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DriverScheduleService } from './driver-schedule.service';

/** A escala do proprio motoboy, para a tela Escala do aplicativo. So leitura: quem monta e a central. */
@Controller('driver/schedule')
@UseGuards(JwtAuthGuard, DriverOnlyGuard)
export class DriverScheduleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: DriverScheduleService,
  ) {}

  @Get()
  async get(@CurrentUser() user: User): Promise<DriverScheduleView> {
    const driver = await this.prisma.driver.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!driver) {
      throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');
    }
    return this.scheduleService.viewForDriver(driver.id);
  }
}
