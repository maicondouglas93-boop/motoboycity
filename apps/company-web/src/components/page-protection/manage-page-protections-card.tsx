'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { PageProtectionStatusItem } from '@motoboycity/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { companyPageProtectionApi } from '@/lib/api-client';
import { pageProtectionSession } from '@/lib/page-protection-session';
import { session } from '@/lib/session';
import { pageProtectionListQueryKey } from './page-protection-boundary';

type DialogMode = 'create' | 'change_password' | 'disable' | null;

export function ManagePageProtectionsCard() {
  const token = session.getToken();
  const queryClient = useQueryClient();

  const [activeItem, setActiveItem] = useState<PageProtectionStatusItem | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  const { data: protections, isLoading } = useQuery({
    queryKey: pageProtectionListQueryKey,
    queryFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyPageProtectionApi.list(token);
    },
    enabled: Boolean(token),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token || !activeItem) throw new Error('Dados ausentes.');

      if (dialogMode === 'disable') {
        return companyPageProtectionApi.updateProtection(token, activeItem.routeKey, {
          enabled: false,
        });
      }

      if (!password || password.length < 4) {
        throw new Error('A senha deve ter pelo menos 4 caracteres.');
      }
      if (password !== confirmPassword) {
        throw new Error('As senhas digitadas não coincidem.');
      }

      if (dialogMode === 'create' || !activeItem.hasProtection) {
        return companyPageProtectionApi.setProtection(token, {
          routeKey: activeItem.routeKey,
          password,
        });
      }

      return companyPageProtectionApi.updateProtection(token, activeItem.routeKey, {
        password,
        enabled: true,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<PageProtectionStatusItem[]>(
        pageProtectionListQueryKey,
        (old) =>
          old?.map((item) => (item.routeKey === updated.routeKey ? updated : item)) ?? [
            updated,
          ],
      );

      // Invalida tokens locais se a senha foi alterada ou desativada
      if (activeItem) {
        pageProtectionSession.clearUnlockToken(activeItem.routeKey);
      }

      const msg =
        dialogMode === 'disable'
          ? `Proteção da página "${activeItem?.label}" foi desativada.`
          : `Senha da página "${activeItem?.label}" configurada com sucesso.`;

      setSuccessFeedback(msg);
      closeDialog();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('Ocorreu um erro ao salvar a proteção.');
      }
    },
  });

  const openDialog = (item: PageProtectionStatusItem, mode: DialogMode) => {
    setActiveItem(item);
    setDialogMode(mode);
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setActiveItem(null);
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const handleToggleReactivate = async (item: PageProtectionStatusItem) => {
    if (!token) return;
    try {
      const updated = await companyPageProtectionApi.updateProtection(token, item.routeKey, {
        enabled: true,
      });
      queryClient.setQueryData<PageProtectionStatusItem[]>(
        pageProtectionListQueryKey,
        (old) =>
          old?.map((curr) => (curr.routeKey === updated.routeKey ? updated : curr)) ?? [
            updated,
          ],
      );
      setSuccessFeedback(`Proteção da página "${item.label}" foi reativada.`);
    } catch (err) {
      setSuccessFeedback(null);
      alert(err instanceof Error ? err.message : 'Falha ao reativar proteção.');
    }
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Proteção de páginas</CardTitle>
            <CardDescription className="text-sm">
              Defina uma senha adicional de proteção para páginas e relatórios confidenciais da sua
              empresa.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {successFeedback && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{successFeedback}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setSuccessFeedback(null)}
            >
              Fechar
            </Button>
          </div>
        )}

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Página</TableHead>
                <TableHead className="w-[30%]">Proteção</TableHead>
                <TableHead className="w-[30%] text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">
                    Carregando proteções...
                  </TableCell>
                </TableRow>
              ) : protections && protections.length > 0 ? (
                protections.map((item) => (
                  <TableRow key={item.routeKey}>
                    <TableCell className="font-medium">
                      <div>
                        <div className="flex items-center gap-2">
                          <span>{item.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">{item.path}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                          {item.description}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.enabled ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <ShieldCheck className="size-3.5" />
                          Ativada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          <Unlock className="size-3.5" />
                          Desativada
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.hasProtection ? (
                          <>
                            {item.enabled ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDialog(item, 'change_password')}
                                >
                                  Alterar senha
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => openDialog(item, 'disable')}
                                >
                                  Desativar
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleToggleReactivate(item)}
                                >
                                  Reativar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openDialog(item, 'change_password')}
                                >
                                  Alterar senha
                                </Button>
                              </>
                            )}
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="font-semibold"
                            onClick={() => openDialog(item, 'create')}
                          >
                            <Lock className="mr-1.5 size-3.5" />
                            Proteger
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">
                    Nenhuma página disponível no catálogo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Dialog para Definir / Alterar Senha */}
      <Dialog open={dialogMode === 'create' || dialogMode === 'change_password'} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Proteger página' : 'Alterar senha de proteção'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? `Defina a senha que será exigida para acessar "${activeItem?.label}".`
                : `Digite a nova senha para acessar "${activeItem?.label}". As autorizações anteriores serão invalidadas imediatamente.`}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="input-page-password">
                {dialogMode === 'create' ? 'Senha' : 'Nova senha'}
              </Label>
              <Input
                id="input-page-password"
                type="password"
                placeholder="••••••••"
                value={password}
                autoFocus
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="input-page-confirm-password">Confirmar senha</Label>
              <Input
                id="input-page-confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
              />
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs font-medium text-destructive">
                <ShieldAlert className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending || !password}
                className="font-semibold"
              >
                {saveMutation.isPending
                  ? 'Salvando...'
                  : dialogMode === 'create'
                    ? 'Ativar proteção'
                    : 'Salvar nova senha'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para Desativar Proteção */}
      <Dialog open={dialogMode === 'disable'} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desativar proteção da página</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja desativar a proteção da página{' '}
              <strong>{activeItem?.label}</strong>? Qualquer membro com acesso à sua empresa
              poderá visualizá-la diretamente sem solicitar senha.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs font-medium text-destructive">
              <ShieldAlert className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Desativando...' : 'Desativar proteção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
