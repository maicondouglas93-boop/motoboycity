export type UserType = 'COMPANY_MEMBER' | 'DRIVER' | 'ADMIN';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  type: UserType;
}
