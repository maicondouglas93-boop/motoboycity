'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Camera, CheckCircle2, ImageUp, ShieldCheck, UserRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CompanyDataForm,
  companyProfileQueryKey,
} from '@/components/profile/company-data-form';
import { ChangePasswordForm } from '@/components/profile/change-password-form';
import { authApi, companyProfileApi } from '@/lib/api-client';
import { authUserQueryKey, authUserQueryOptions } from '@/lib/auth-user-query';
import { session } from '@/lib/session';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'E'
  );
}

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'Foram feitas muitas tentativas. Aguarde um minuto e tente novamente.';
    }
    return error.message;
  }
  return 'Não foi possível enviar a foto. Verifique sua conexão e tente novamente.';
}

function profileLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Não foi possível carregar os dados da empresa.';
}

export default function CompanyProfilePage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const userQuery = useQuery(authUserQueryOptions(token));
  const companyProfileQuery = useQuery({
    queryKey: companyProfileQueryKey,
    queryFn: () => {
      if (!token) throw new Error('Sessão ausente.');
      return companyProfileApi.get(token);
    },
    enabled: Boolean(token),
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!token) throw new Error('Sessão ausente.');
      const formData = new FormData();
      formData.append('file', file);
      return authApi.uploadAvatar(token, formData);
    },
    onMutate: () => {
      setFeedback(null);
      setFileError(null);
    },
    onSuccess: (user) => {
      if (session.getToken() !== token) return;
      queryClient.setQueryData(authUserQueryKey, user);
      setFeedback('Foto de perfil atualizada.');
    },
    onError: (error) => setFileError(uploadErrorMessage(error)),
  });

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setFeedback(null);
    setFileError(null);

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setFileError('Escolha uma imagem JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setFileError('A imagem deve ter no máximo 5 MB.');
      return;
    }

    uploadMutation.mutate(file);
  }

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para abrir seu perfil.</p>;
  }

  const user = userQuery.data;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-portal-deep">
          Meu perfil
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie sua identidade e os dados comerciais da empresa.
        </p>
      </div>

      {userQuery.isPending && (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Carregando seu perfil...
          </CardContent>
        </Card>
      )}

      {userQuery.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">
              {userQuery.error instanceof ApiError
                ? userQuery.error.message
                : 'Não foi possível carregar seu perfil.'}
            </p>
            <Button variant="outline" onClick={() => userQuery.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {user && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Foto de perfil</CardTitle>
              <CardDescription>
                Esta foto identifica sua conta no painel. A alteração aparece no menu assim que o
                envio termina.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <Avatar className="size-28 ring-4 ring-portal-soft">
                {user.avatarUrl && (
                  <AvatarImage src={user.avatarUrl} alt={`Foto de ${user.name}`} />
                )}
                <AvatarFallback className="bg-gradient-to-br from-portal-soft to-colete/25 font-heading text-2xl font-bold text-portal-deep">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 space-y-3" aria-busy={uploadMutation.isPending}>
                <div>
                  <p className="font-semibold text-portal-deep">{user.name}</p>
                  <p id="avatar-upload-help" className="text-sm text-muted-foreground">
                    JPEG, PNG ou WebP de até 5 MB.
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadMutation.isPending}
                  onChange={handleFileChange}
                  aria-label="Escolher nova foto de perfil"
                  aria-describedby={
                    fileError ? 'avatar-upload-help avatar-upload-error' : 'avatar-upload-help'
                  }
                />
                <Button
                  type="button"
                  disabled={uploadMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                  aria-busy={uploadMutation.isPending}
                  aria-describedby={
                    fileError ? 'avatar-upload-help avatar-upload-error' : 'avatar-upload-help'
                  }
                >
                  {uploadMutation.isPending ? (
                    <ImageUp aria-hidden="true" className="animate-pulse" />
                  ) : (
                    <Camera aria-hidden="true" />
                  )}
                  {uploadMutation.isPending ? 'Enviando foto...' : 'Escolher nova foto'}
                </Button>

                {feedback && (
                  <p className="flex items-center gap-2 text-sm text-status-entregue" role="status">
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                    {feedback}
                  </p>
                )}
                {fileError && (
                  <p id="avatar-upload-error" className="text-sm text-destructive" role="alert">
                    {fileError}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados da conta</CardTitle>
              <CardDescription>Informações usadas para entrar no painel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 rounded-xl border border-border/70 bg-muted/35 p-3">
                <UserRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-portal" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Nome</p>
                  <p className="truncate font-medium text-portal-deep">{user.name}</p>
                </div>
              </div>
              <div className="flex gap-3 rounded-xl border border-border/70 bg-muted/35 p-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-portal" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">E-mail de acesso</p>
                  <p className="break-all font-medium text-portal-deep">{user.email}</p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                O e-mail de acesso e a senha continuam protegidos e não são alterados neste
                formulário.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {user && <ChangePasswordForm token={token} />}

      {user && companyProfileQuery.isPending && (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Carregando dados da empresa...
          </CardContent>
        </Card>
      )}

      {user && companyProfileQuery.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">
              {profileLoadErrorMessage(companyProfileQuery.error)}
            </p>
            <Button variant="outline" onClick={() => companyProfileQuery.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {user && companyProfileQuery.data && (
        <CompanyDataForm
          key={companyProfileQuery.data.companyId}
          token={token}
          profile={companyProfileQuery.data}
        />
      )}
    </div>
  );
}
