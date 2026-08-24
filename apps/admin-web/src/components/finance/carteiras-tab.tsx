'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { WithdrawalRequestStatus } from '@motoboycity/types';
import { Building2, Clock, Eye, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { WalletAdjustmentDialog } from '@/components/finance/wallet-adjustment-dialog';
import { adminFinancialApi } from '@/lib/api-client';
import { formatarDataHora } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

const ROTULO_DO_STATUS: Record<WithdrawalRequestStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  PAID: 'Pago',
  REJECTED: 'Recusado',
};

export function CarteirasTab({ token }: { token: string }) {
  const money = useMoney();
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');

  const pendentesQuery = useQuery({
    queryKey: ['admin', 'financial', 'withdrawals', 'pending-count'],
    queryFn: () => adminFinancialApi.listWithdrawals(token, { status: 'PENDING' }),
  });

  const historicoQuery = useQuery({
    queryKey: ['admin', 'financial', 'withdrawals', 'historico'],
    queryFn: () => adminFinancialApi.listWithdrawals(token, {}),
  });

  const carteirasQuery = useQuery({
    queryKey: ['admin', 'financial', 'driver-wallets', buscaAplicada],
    queryFn: () =>
      adminFinancialApi.listDriverWallets(token, {
        ...(buscaAplicada && { search: buscaAplicada }),
      }),
  });

  const pendentes = pendentesQuery.data ?? [];
  const carteiras = carteirasQuery.data ?? [];
  /**
   * O histórico exclui o que ainda está pendente: aquilo já aparece na seção de
   * cima, e repetir a mesma linha em duas tabelas da mesma tela faz o admin
   * contar duas vezes.
   */
  const historico = (historicoQuery.data ?? []).filter((saque) => saque.status !== 'PENDING');

  return (
    <div className="space-y-6">
      {/*
        A fila pendente vem PRIMEIRO: é a única coisa desta aba com prazo.
        Enquanto ela não zera, tem gente esperando dinheiro.
      */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock aria-hidden className="size-4 text-dinheiro-aguardando" />
            Saques aguardando decisão
            {pendentes.length > 0 && (
              <span className="rounded-full bg-dinheiro-atrasado px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                {pendentes.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pendentesQuery.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando a fila...</p>
          ) : pendentesQuery.isError ? (
            <p className="p-6 text-sm text-destructive">Não foi possível carregar a fila.</p>
          ) : pendentes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum saque esperando. Nada a fazer aqui agora.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entregador</TableHead>
                  <TableHead>Valor a pagar</TableHead>
                  <TableHead>Solicitado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map((saque) => (
                  <TableRow key={saque.id}>
                    <TableCell className="font-medium">{saque.driver.name}</TableCell>
                    {/*
                      O líquido, e não o bruto: é o que sai da conta da operação.
                      Mostrar o bruto aqui faria o admin transferir a mais.
                    */}
                    <TableCell className="font-mono tabular-nums">
                      {money(saque.netAmount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarDataHora(saque.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/financeiro/saques/${saque.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                      >
                        <Eye aria-hidden className="size-3.5" />
                        Analisar
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Carteiras dos entregadores</CardTitle>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              Saldos calculados do ledger. O que está “a liberar” não pode ser sacado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Buscar entregador"
              className="w-56"
              placeholder="Nome ou e-mail"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') setBuscaAplicada(busca.trim());
              }}
            />
            <Button variant="outline" size="icon" onClick={() => setBuscaAplicada(busca.trim())}>
              <Search className="size-4" />
              <span className="sr-only">Buscar</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBusca('');
                setBuscaAplicada('');
              }}
            >
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {carteirasQuery.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando carteiras...</p>
          ) : carteirasQuery.isError ? (
            <p className="p-6 text-sm text-destructive">Não foi possível carregar as carteiras.</p>
          ) : carteiras.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum entregador encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entregador</TableHead>
                  <TableHead>Disponível</TableHead>
                  <TableHead>A liberar</TableHead>
                  <TableHead>Saques pendentes</TableHead>
                  <TableHead>Conferência</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carteiras.map((carteira) => (
                  <TableRow key={carteira.driverId}>
                    <TableCell>
                      <p className="font-medium">{carteira.driverName}</p>
                      <p className="text-xs text-muted-foreground">{carteira.driverEmail}</p>
                    </TableCell>
                    <TableCell className="font-mono text-dinheiro-recebido tabular-nums">
                      {money(carteira.availableBalance)}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground tabular-nums">
                      {money(carteira.blockedBalance)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {money(carteira.pendingWithdrawalAmount)}
                    </TableCell>
                    <TableCell>
                      {/*
                        Divergência entre o saldo guardado e a soma do ledger é
                        erro de contabilidade, não detalhe: por isso vermelho.
                      */}
                      <span
                        className={
                          carteira.cacheMatchesLedger
                            ? 'text-dinheiro-recebido'
                            : 'text-dinheiro-atrasado'
                        }
                      >
                        {carteira.cacheMatchesLedger ? 'Conferido' : 'Divergência'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <WalletAdjustmentDialog
                          token={token}
                          driverId={carteira.driverId}
                          driverName={carteira.driverName}
                          saldoAtual={carteira.availableBalance}
                        />
                        <Link
                          className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                          href={`/entregadores/${carteira.driverId}`}
                        >
                          Ver
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 aria-hidden className="size-4 text-muted-foreground" />
            Carteiras das empresas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-xl bg-dinheiro-retido-suave p-4 text-sm text-muted-foreground">
            A operação ainda não usa carteira de empresa — hoje a cobrança é por fatura. O cadastro
            já existe no sistema e esta seção passa a listar saldos quando for ligada.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Saques já decididos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historicoQuery.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando histórico...</p>
          ) : historico.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum saque decidido ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Entregador</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((saque) => (
                  <TableRow key={saque.id}>
                    <TableCell className="text-muted-foreground">
                      {formatarDataHora(saque.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">{saque.driver.name}</TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {money(saque.netAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={saque.status === 'REJECTED' ? 'destructive' : 'default'}>
                        {ROTULO_DO_STATUS[saque.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/financeiro/saques/${saque.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                      >
                        <Eye aria-hidden className="size-3.5" />
                        Ver
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
