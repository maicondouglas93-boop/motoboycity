import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  loginSchema,
  registerCompanyApiSchema,
  registerDriverApiSchema,
  type LoginPayload,
  type RegisterCompanyPayload,
  type RegisterDriverPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  AuthService,
  type LoginResult,
  type RegisterCompanyResult,
  type RegisterDriverResult,
} from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/company')
  @HttpCode(HttpStatus.CREATED)
  @Throttle(AUTH_THROTTLE)
  registerCompany(
    @Body(new ZodValidationPipe(registerCompanyApiSchema)) body: RegisterCompanyPayload,
  ): Promise<RegisterCompanyResult> {
    return this.authService.registerCompany(body);
  }

  @Post('register/driver')
  @HttpCode(HttpStatus.CREATED)
  @Throttle(AUTH_THROTTLE)
  registerDriver(
    @Body(new ZodValidationPipe(registerDriverApiSchema)) body: RegisterDriverPayload,
  ): Promise<RegisterDriverResult> {
    return this.authService.registerDriver(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginPayload): Promise<LoginResult> {
    return this.authService.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      type: user.type,
      avatarUrl: user.avatarUrl,
    };
  }
}
