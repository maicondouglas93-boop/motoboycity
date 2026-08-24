'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { companyFinancialApi } from '@/lib/api-client';
import { formatarData, formatarDinheiro, formatarNumero } from '@/lib/dinheiro';

export function PedidosTab({ token }: { token: string }) {
  const pedidosQuery = useQuery({
    queryKey: ['company', 'financial', 'unbilled'],
    queryFn: () => companyFinancialApi.unbilled(token),
  });

  const dados = pedidosQuery.data;
  const pedidos = dados?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Pedidos sem fatura</h2>
        <p className="text-sm text-muted-foreground">
          {dados
            ? `Estes ${formatarNumero(dados.count)} pedido(s) entram na fatura que fecha em ${formatarData(dados.closingDate)}.`
            : 'Pedidos já concluídos que ainda não entraram em nenhuma fatura.'}
        </p>
      </div>

      {pedidosQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando pedidos...</p>
      )}
      {pedidosQuery.isError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar os pedidos. Tente novamente.
        </p>
      )}

      <Card className="premium-panel">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Concluído em</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Modalidade</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedidos.length === 0 && !pedidosQuery.isLoading && !pedidosQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <PackageOpen className="size-8" />
                      Nenhum pedido aguardando fatura. Tudo em dia por aqui.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pedidos.map((pedido) => (
                  <TableRow key={pedido.id}>
                    <TableCell className="font-medium">
                      <Link href={`/pedidos/${pedido.id}`} className="hover:underline">
                        #{pedido.displayNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{formatarData(pedido.completedAt)}</TableCell>
                    <TableCell className="max-w-xs truncate" title={pedido.dropoffAddress}>
                      {pedido.dropoffAddress}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {pedido.serviceTypeName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatarDinheiro(pedido.totalValue)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {pedidos.length > 0 && dados && (
              <tfoot className="border-t bg-muted/40">
                {/*
                  O total no rodape existe para a loja nao ter que somar a
                  coluna na mao — e para bater com o cartao do resumo.
                */}
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-medium">
                    Total que entra na próxima fatura
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-base font-semibold text-dinheiro-nao-cobrado">
                    {formatarDinheiro(dados.total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
