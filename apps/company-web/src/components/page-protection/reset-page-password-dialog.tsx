'use client';

import { useState, type FormEvent } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type {
  PageProtectionStatusItem,
  ProtectablePageRoute,
  ResetPageProtectionPayload,
} from '@motoboycity/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyPageProtectionApi } from '@/lib/api-client';
import { pageProtectionSession } from '@/lib/page-protection-session';
import { session } from '@/lib/session';
import {
  pageProtectionListQueryKey,
  pageProtectionRecoveryQueryKey,
} from './page-protection-queries';

type Method = ResetPageProtectionPayload['method'];

interface ResetPagePasswordDialogProps {
  page: { routeKey: ProtectablePageRoute; label: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset?: (updated: PageProtectionStatusItem) => void;
}

/** Mensagem do erro da API como o dono precisa ler. */
export function protectionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Nova senha para uma página cuja senha foi esquecida.
 *
 * Dois jeitos de provar que é o dono: a senha de login do painel ou a resposta
 * da pergunta secreta. A API confere, e só o responsável principal (OWNER)
 * consegue — um operador com login próprio recebe a recusa.
 */
export function ResetPagePasswordDialog({
  page,
  open,
  onOpenChange,
  onReset,
}: ResetPagePasswordDialogProps) {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<Method>('ACCOUNT_PASSWORD');
  const [accountPassword, setAccountPassword] = useState('');
  const [secretAnswer, setSecretAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: recovery } = useQuery({
    queryKey: pageProtectionRecoveryQueryKey,
    queryFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyPageProtectionApi.getRecovery(token);
    },
    enabled: open && Boolean(token),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!token || !page) throw new Error('Sessão ausente.');
      if (newPassword.length < 4) {
        throw new Error('A nova senha deve ter pelo menos 4 caracteres.');
      }
      if (newPassword !== confirmPassword) {
        throw new Error('As senhas digitadas não coincidem.');
      }
      const payload: ResetPageProtectionPayload =
        method === 'ACCOUNT_PASSWORD'
          ? { method, accountPassword, newPassword }
          : { method, secretAnswer, newPassword };
      return companyPageProtectionApi.resetPassword(token, page.routeKey, payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<PageProtectionStatusItem[]>(pageProtectionListQueryKey, (old) =>
        old?.map((item) => (item.routeKey === updated.routeKey ? updated : item)),
      );
      // A senha velha deixou de valer: a autorização aberta com ela tambem.
      pageProtectionSession.clearUnlockToken(updated.routeKey);
      onReset?.(updated);
      close();
    },
    onError: (error) => {
      setFormError(protectionErrorMessage(error, 'Não foi possível redefinir a senha.'));
    },
  });

  function close() {
    setMethod('ACCOUNT_PASSWORD');
    setAccountPassword('');
    setSecretAnswer('');
    setNewPassword('');
    setConfirmPassword('');
    setFormError(null);
    onOpenChange(false);
  }

  function clearError() {
    if (formError) setFormError(null);
  }

  const proof = method === 'ACCOUNT_PASSWORD' ? accountPassword : secretAnswer;
  const secretUnavailable = method === 'SECRET_ANSWER' && recovery?.configured === false;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Esqueci a senha</DialogTitle>
          <DialogDescription>
            Crie uma nova senha para <strong>{page?.label}</strong>. Quem estiver com a página
            aberta vai precisar da nova senha. Só o responsável principal da empresa pode fazer
            isso.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            resetMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como confirmar">
            <Button
              type="button"
              role="radio"
              aria-checked={method === 'ACCOUNT_PASSWORD'}
              variant={method === 'ACCOUNT_PASSWORD' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMethod('ACCOUNT_PASSWORD');
                clearError();
              }}
            >
              Senha de login
            </Button>
            <Button
              type="button"
              role="radio"
              aria-checked={method === 'SECRET_ANSWER'}
              variant={method === 'SECRET_ANSWER' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMethod('SECRET_ANSWER');
                clearError();
              }}
            >
              Pergunta secreta
            </Button>
          </div>

          {method === 'ACCOUNT_PASSWORD' ? (
            <div className="space-y-2">
              <Label htmlFor="reset-account-password">Senha de login do painel</Label>
              <Input
                id="reset-account-password"
                type="password"
                autoComplete="current-password"
                value={accountPassword}
                onChange={(event) => {
                  setAccountPassword(event.target.value);
                  clearError();
                }}
              />
              <p className="text-xs text-muted-foreground">
                A mesma senha que você usa para entrar no painel.
              </p>
            </div>
          ) : secretUnavailable ? (
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              A empresa ainda não cadastrou uma pergunta secreta. Use a senha de login, ou cadastre
              a pergunta em Configurações → Proteção de páginas.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="reset-secret-answer">
                {recovery?.question ?? 'Carregando a pergunta...'}
              </Label>
              <Input
                id="reset-secret-answer"
                autoComplete="off"
                value={secretAnswer}
                onChange={(event) => {
                  setSecretAnswer(event.target.value);
                  clearError();
                }}
              />
              <p className="text-xs text-muted-foreground">
                Acento, maiúscula e espaço sobrando não contam.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reset-new-password">Nova senha da página</Label>
            <Input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                clearError();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">Confirmar nova senha</Label>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                clearError();
              }}
            />
          </div>

          {formError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs font-medium text-destructive"
            >
              <ShieldAlert className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="font-semibold"
              disabled={
                resetMutation.isPending || !proof.trim() || !newPassword || secretUnavailable
              }
            >
              {resetMutation.isPending ? 'Redefinindo...' : 'Redefinir senha'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
