'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { CabecalhoDeConfiguracao } from '@/components/settings/estado-da-configuracao';
import { Bike } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { adminServiceTypesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

export default function ServiceTypesPage() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const token = session.getToken();

  const serviceTypesQuery = useQuery({
    queryKey: ['admin', 'service-types'],
    queryFn: () => adminServiceTypesApi.list(token as string),
    enabled: Boolean(token),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { code: string; name: string }) =>
      adminServiceTypesApi.create(token as string, payload),
    onSuccess: () => {
      setFormError(null);
      setCode('');
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'service-types'] });
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível criar.');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      adminServiceTypesApi.update(token as string, id, { active }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'service-types'] });
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : 'Não foi possível atualizar.');
    },
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver os tipos de serviço.
      </p>
    );
  }

  const serviceTypes = serviceTypesQuery.data ?? [];
  const ativas = serviceTypes.filter((item) => item.active).length;

  function handleCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    createMutation.mutate({ code: code.trim().toUpperCase(), name: name.trim() });
  }

  return (
    <div className="space-y-6">
      <Link href="/configuracoes" className="text-sm text-muted-foreground hover:underline">
        ← Configurações
      </Link>

      <CabecalhoDeConfiguracao
        icon={Bike}
        tom="modalidades"
        titulo="Tipos de serviços"
        descricao="As modalidades que podem ser atribuídas aos entregadores. Sem nenhuma ativa, o despacho não tem o que oferecer."
        situacao={
          ativas === 0
            ? { estado: 'faltando', texto: 'Nenhuma modalidade ativa' }
            : { estado: 'definido', texto: `${ativas} ativa${ativas === 1 ? '' : 's'}` }
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Novo tipo de serviço</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleCreate}>
            <div className="space-y-1.5">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                placeholder="MOTO"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Moto"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-60"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Criando...' : 'Criar'}
            </Button>
          </form>
          {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
        </CardContent>
      </Card>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {serviceTypesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando tipos de serviço...</p>
      )}
      {serviceTypesQuery.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar os tipos de serviço.</p>
      )}
      {serviceTypesQuery.isSuccess && serviceTypes.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum tipo de serviço cadastrado ainda.</p>
      )}

      {serviceTypes.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {serviceTypes.map((serviceType) => (
              <TableRow key={serviceType.id}>
                <TableCell className="font-mono text-xs">{serviceType.code}</TableCell>
                <TableCell>{serviceType.name}</TableCell>
                <TableCell>
                  <Badge variant={serviceType.active ? 'default' : 'outline'}>
                    {serviceType.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ConfirmActionDialog
                    title={`${serviceType.active ? 'Desativar' : 'Ativar'} ${serviceType.name}?`}
                    description="Confirme a mudança desta modalidade."
                    consequence={
                      serviceType.active
                        ? 'A modalidade deixará de aparecer em novos cadastros e novas solicitações, sem alterar pedidos já criados.'
                        : 'A modalidade voltará a ficar disponível para novas configurações e solicitações.'
                    }
                    confirmLabel={serviceType.active ? 'Desativar modalidade' : 'Ativar modalidade'}
                    pendingLabel={serviceType.active ? 'Desativando...' : 'Ativando...'}
                    variant={serviceType.active ? 'destructive' : 'default'}
                    onConfirm={() =>
                      toggleActiveMutation.mutateAsync({
                        id: serviceType.id,
                        active: !serviceType.active,
                      })
                    }
                  >
                    <Button variant="outline" size="sm" disabled={toggleActiveMutation.isPending}>
                      {serviceType.active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </ConfirmActionDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
