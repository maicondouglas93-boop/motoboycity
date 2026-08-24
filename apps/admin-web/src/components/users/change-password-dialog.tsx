'use client';

import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { changeAdminPasswordSchema } from '@motoboycity/validation';
import { KeyRound, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ChangePasswordDialogProps {
  children: ReactElement;
  targetName: string;
  targetEmail: string;
  changePassword: (password: string) => Promise<unknown>;
  onChanged: () => void;
}

export function ChangePasswordDialog({
  children,
  targetName,
  targetEmail,
  changePassword,
  onChanged,
}: ChangePasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const instanceId = useId();
  const formId = `${instanceId}-change-password-form`;
  const passwordId = `${instanceId}-new-password`;
  const confirmationId = `${instanceId}-confirm-new-password`;
  const passwordErrorId = `${instanceId}-password-error`;

  const mutation = useMutation({
    mutationFn: () => changePassword(password),
    onSuccess: () => {
      onChanged();
      reset();
      setOpen(false);
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível alterar a senha. Tente novamente.',
      );
    },
  });

  function reset() {
    setPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setFormError(null);
    mutation.reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mutation.isPending) return;
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (password !== confirmPassword) {
      setPasswordError('As senhas não coincidem.');
      return;
    }
    const result = changeAdminPasswordSchema.safeParse({ password });
    if (!result.success) {
      setPasswordError(result.error.issues[0]?.message ?? 'Senha inválida.');
      return;
    }
    setPasswordError(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={children} />
      <DialogContent className="max-w-lg" closeDisabled={mutation.isPending}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <KeyRound className="size-5" />
            </span>
            <div>
              <DialogTitle>Alterar senha de acesso</DialogTitle>
              <DialogDescription>Defina uma nova senha para {targetName}.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <form id={formId} className="space-y-5" noValidate onSubmit={handleSubmit}>
            <div className="rounded-2xl border border-border/80 bg-muted/35 px-4 py-3">
              <p className="font-medium">{targetName}</p>
              <p className="text-sm text-muted-foreground">{targetEmail}</p>
            </div>

            <div className="flex gap-3 rounded-2xl border border-alerta/25 bg-alerta/8 px-4 py-3 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-alerta" />
              <p className="text-muted-foreground">
                Ao confirmar, as sessões atuais desta conta serão encerradas. A nova senha deve ser
                compartilhada por um canal seguro.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={passwordId}>Nova senha</Label>
                <Input
                  id={passwordId}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setPasswordError(null);
                    setFormError(null);
                  }}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? passwordErrorId : undefined}
                  placeholder="Mínimo de 8 caracteres"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={confirmationId}>Confirmar senha</Label>
                <Input
                  id={confirmationId}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setPasswordError(null);
                    setFormError(null);
                  }}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? passwordErrorId : undefined}
                  placeholder="Repita a nova senha"
                />
              </div>
            </div>
            {passwordError && (
              <p id={passwordErrorId} role="alert" className="text-sm text-destructive">
                {passwordError}
              </p>
            )}
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
          </form>
        </DialogBody>

        <DialogFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => handleOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={mutation.isPending}>
            {mutation.isPending ? 'Alterando...' : 'Confirmar nova senha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
