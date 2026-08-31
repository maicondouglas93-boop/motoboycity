'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LockKeyhole } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import {
  changeOwnPasswordSchema,
  type ChangeOwnPasswordPayload,
} from '@motoboycity/validation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyProfileApi } from '@/lib/api-client';
import { session } from '@/lib/session';

type PasswordField = keyof ChangeOwnPasswordPayload | 'confirmPassword';
type PasswordFieldErrors = Partial<Record<PasswordField, string>>;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'Foram feitas muitas tentativas. Aguarde um minuto e tente novamente.';
    }
    return error.message;
  }
  return 'Não foi possível alterar sua senha. Verifique sua conexão e tente novamente.';
}

export function ChangePasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({});

  const mutation = useMutation({
    mutationFn: (payload: ChangeOwnPasswordPayload) =>
      companyProfileApi.changePassword(token, payload),
    onMutate: () => setFieldErrors({}),
    onSuccess: () => {
      if (session.getToken() !== token) return;
      session.clearToken();
      queryClient.clear();
      router.replace('/login?passwordChanged=1');
    },
  });

  function clearFieldError(field: PasswordField) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = changeOwnPasswordSchema.safeParse({ currentPassword, newPassword });
    const nextErrors: PasswordFieldErrors = {};

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      nextErrors.currentPassword = errors.currentPassword?.[0];
      nextErrors.newPassword = errors.newPassword?.[0];
    }
    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = 'A confirmação deve ser igual à nova senha.';
    }
    if (!result.success || nextErrors.confirmPassword) {
      setFieldErrors(nextErrors);
      return;
    }

    mutation.mutate(result.data);
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 bg-gradient-to-r from-portal-soft/70 to-transparent">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-portal p-2.5 text-white shadow-sm">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </div>
          <div>
            <CardTitle>Segurança da conta</CardTitle>
            <CardDescription className="mt-1">
              Altere sua senha de acesso. Por segurança, todas as sessões atuais serão encerradas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-5 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="current-password">Senha atual</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  clearFieldError('currentPassword');
                }}
                aria-invalid={Boolean(fieldErrors.currentPassword)}
                aria-describedby={fieldErrors.currentPassword ? 'current-password-error' : undefined}
              />
              {fieldErrors.currentPassword && (
                <p id="current-password-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.currentPassword}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  clearFieldError('newPassword');
                }}
                aria-invalid={Boolean(fieldErrors.newPassword)}
                aria-describedby={fieldErrors.newPassword ? 'new-password-error' : 'new-password-help'}
              />
              <p id="new-password-help" className="text-xs text-muted-foreground">
                Use pelo menos 8 caracteres.
              </p>
              {fieldErrors.newPassword && (
                <p id="new-password-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.newPassword}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  clearFieldError('confirmPassword');
                }}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
              />
              {fieldErrors.confirmPassword && (
                <p id="confirm-password-error" className="text-xs text-destructive" role="alert">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(mutation.error)}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              <KeyRound aria-hidden="true" />
              {mutation.isPending ? 'Alterando senha...' : 'Alterar senha'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
