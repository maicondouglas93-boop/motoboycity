import type { DriverCompensation } from './driver.js';

export type UserType = 'COMPANY_MEMBER' | 'DRIVER' | 'ADMIN';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  type: UserType;
  avatarUrl: string | null;
  /**
   * Só para o motoboy: como ele é pago. Com `SALARIED` o app não mostra
   * valores (oferta, entregas, histórico, carteira).
   */
  driverCompensation?: DriverCompensation;
}

/** A nova senha e o hash nunca fazem parte da resposta administrativa. */
export interface AdminPasswordChangeResult {
  userId: string;
}

/** A troca da propria senha nunca devolve a credencial nem seu hash. */
export interface OwnPasswordChangeResult {
  changed: true;
}
