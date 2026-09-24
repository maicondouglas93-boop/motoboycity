import { SetMetadata } from '@nestjs/common';
import type { ProtectablePageRoute } from '@motoboycity/types';
import { PAGE_PROTECTION_KEY } from './page-protection.constants';

export const RequirePageProtection = (routeKey: ProtectablePageRoute) =>
  SetMetadata(PAGE_PROTECTION_KEY, routeKey);
