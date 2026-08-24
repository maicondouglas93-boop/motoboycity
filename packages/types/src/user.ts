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
