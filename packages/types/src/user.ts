export type UserType = 'COMPANY_MEMBER' | 'DRIVER' | 'ADMIN';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  type: UserType;
  avatarUrl: string | null;
}

/** A nova senha e o hash nunca fazem parte da resposta administrativa. */
export interface AdminPasswordChangeResult {
  userId: string;
}

/** A troca da propria senha nunca devolve a credencial nem seu hash. */
export interface OwnPasswordChangeResult {
  changed: true;
}
