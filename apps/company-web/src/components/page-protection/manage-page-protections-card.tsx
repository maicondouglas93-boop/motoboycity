'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { pageProtectionListQueryKey, pageProtectionRecoveryQueryKey } from './page-protection-queries';
import { ResetPagePasswordDialog, protectionErrorMessage } from './reset-page-password-dialog';

type DialogMode = 'create' | 'change_password' | 'disable' | 'reset' | 'recovery' | null;

export function ManagePageProtectionsCard() {
  const token = session.getToken();
  const queryClient = useQueryClient();

  const [activeItem, setActiveItem] = useState<PageProtectionStatusItem | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Senha atual da pagina: desativar ou trocar uma protecao ativa pede ela.
  const [currentPassword, setCurrentPassword] = useState('');
  const [recoveryAccountPassword, setRecoveryAccountPassword] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
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

  const { data: recovery } = useQuery({
    queryKey: pageProtectionRecoveryQueryKey,
    queryFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyPageProtectionApi.getRecovery(token);
    },
    enabled: Boolean(token),
  });

  const recoveryMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyPageProtectionApi.setRecovery(token, {
        accountPassword: recoveryAccountPassword,
        question: recoveryQuestion,
        answer: recoveryAnswer,
      });
    },
    onSuccess: (status) => {
      queryClient.setQueryData(pageProtectionRecoveryQueryKey, status);
      setSuccessFeedback('Pergunta secreta salva. Ela pode ser usada para redefinir senhas.');
      closeDialog();
    },
    onError: (error) => {
      setFormError(protectionErrorMessage(error, 'Não foi possível salvar a pergunta.'));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token || !activeItem) throw new Error('Dados ausentes.');
      const needsCurrent = activeItem.enabled;
      if (needsCurrent && !currentPassword) {
        throw new Error('Digite a senha atual da página.');
      }

      if (dialogMode === 'disable') {
        return companyPageProtectionApi.updateProtection(token, activeItem.routeKey, {
          enabled: false,
          currentPassword,
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
        ...(needsCurrent && { currentPassword }),
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
      setFormError(protectionErrorMessage(err, 'Ocorreu um erro ao salvar a proteção.'));
    },
  });

  const clearFields = () => {
    setPassword('');
    setConfirmPassword('');
    setCurrentPassword('');
    setRecoveryAccountPassword('');
    setRecoveryAnswer('');
    setFormError(null);
  };

  const openDialog = (item: PageProtectionStatusItem, mode: DialogMode) => {
    setActiveItem(item);
    setDialogMode(mode);
    clearFields();
  };

  const closeDialog = () => {
    setDialogMode(null);
    setActiveItem(null);
    clearFields();
  };

  const openRecoveryDialog = () => {
    setActiveItem(null);
    clearFields();
    setRecoveryQuestion(recovery?.question ?? '');
    setDialogMode('recovery');
  };

  /** Do diálogo de alterar ou desativar direto para a redefinição, na mesma página. */
  const forgotPassword = () => {
    clearFields();
    setDialogMode('reset');
  };

  const forgotPasswordLink = (
    <button
      type="button"
      onClick={forgotPassword}
      className="text-xs font-medium text-portal underline-offset-4 hover:underline"
    >
      Esqueci a senha
    </button>
  );

  const currentPasswordField = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="input-page-current-password">Senha atual da página</Label>
        {forgotPasswordLink}
      </div>
      <Input
        id="input-page-current-password"
        type="password"
        autoComplete="off"
        placeholder="••••••••"
        value={currentPassword}
        autoFocus
        onChange={(e) => {
          setCurrentPassword(e.target.value);
          if (formError) setFormError(null);
        }}
      />
    </div>
  );

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

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Pergunta secreta</p>
              <p className="text-xs text-muted-foreground">
                {recovery?.configured
                  ? `Cadastrada: "${recovery.question}". Serve para redefinir a senha de uma página esquecida.`
                  : 'Cadastre uma pergunta que só você sabe responder. Ela é outro jeito de redefinir uma senha esquecida, além da senha de login.'}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={openRecoveryDialog}>
            {recovery?.configured ? 'Trocar pergunta' : 'Cadastrar pergunta'}
          </Button>
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
            {dialogMode === 'change_password' && activeItem?.enabled && currentPasswordField}

            <div className="space-y-2">
              <Label htmlFor="input-page-password">
                {dialogMode === 'create' ? 'Senha' : 'Nova senha'}
              </Label>
              <Input
                id="input-page-password"
                type="password"
                placeholder="••••••••"
                value={password}
                autoFocus={!(dialogMode === 'change_password' && activeItem?.enabled)}
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="space-y-4"
          >
            {currentPasswordField}

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
                variant="destructive"
                disabled={saveMutation.isPending || !currentPassword}
              >
                {saveMutation.isPending ? 'Desativando...' : 'Desativar proteção'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ResetPagePasswordDialog
        page={activeItem}
        open={dialogMode === 'reset'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        onReset={(updated) =>
          setSuccessFeedback(`Senha da página "${updated.label}" redefinida. A proteção está ativa.`)
        }
      />

      {/* Dialog da pergunta secreta */}
      <Dialog open={dialogMode === 'recovery'} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pergunta secreta</DialogTitle>
            <DialogDescription>
              Escolha uma pergunta que só você sabe responder. Ela serve para criar uma nova senha
              quando a de uma página for esquecida. Só o responsável principal da empresa pode
              cadastrar, e é preciso confirmar a senha de login.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              recoveryMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="input-recovery-question">Pergunta</Label>
              <Input
                id="input-recovery-question"
                placeholder="Ex.: Qual o nome do meu primeiro cachorro?"
                maxLength={200}
                value={recoveryQuestion}
                autoFocus
                onChange={(e) => {
                  setRecoveryQuestion(e.target.value);
                  if (formError) setFormError(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="input-recovery-answer">Resposta</Label>
              <Input
                id="input-recovery-answer"
                autoComplete="off"
                maxLength={100}
                value={recoveryAnswer}
                onChange={(e) => {
                  setRecoveryAnswer(e.target.value);
                  if (formError) setFormError(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Fica guardada só de forma cifrada: nem a plataforma consegue ler. Acento, maiúscula e
                espaço sobrando não contam na hora de responder.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="input-recovery-account-password">Senha de login do painel</Label>
              <Input
                id="input-recovery-account-password"
                type="password"
                autoComplete="current-password"
                value={recoveryAccountPassword}
                onChange={(e) => {
                  setRecoveryAccountPassword(e.target.value);
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
                className="font-semibold"
                disabled={
                  recoveryMutation.isPending ||
                  recoveryQuestion.trim().length < 5 ||
                  recoveryAnswer.trim().length < 2 ||
                  !recoveryAccountPassword
                }
              >
                {recoveryMutation.isPending ? 'Salvando...' : 'Salvar pergunta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
