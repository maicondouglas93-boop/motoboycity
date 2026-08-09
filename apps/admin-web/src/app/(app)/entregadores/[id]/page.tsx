import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import {
  mockDriverDetailStats,
  mockWalletTransactions,
  mockWithdrawalRequests,
} from '@/lib/mock-data';

export default async function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driverName = decodeURIComponent(id);

  return (
    <div className="space-y-4">
      <Link href="/entregadores" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> Voltar para Entregadores
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Painel do Entregador: {driverName}</h1>
        <div className="flex gap-2">
          <Button variant="outline">Editar Entregador</Button>
          <Button>Ver Dados</Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="orders">Pedidos do Entregador</TabsTrigger>
          <TabsTrigger value="wallet">Carteira Digital</TabsTrigger>
          <TabsTrigger value="withdrawals">Solicitações de Saque</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Saldo da Carteira" value={mockDriverDetailStats.walletBalance} />
            <StatCard label="Status Atual" value={mockDriverDetailStats.status} />
            <StatCard label="Primeiro Pedido" value={mockDriverDetailStats.firstOrder} />
            <StatCard label="Último Pedido" value={mockDriverDetailStats.lastOrder} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total de Pedidos" value={mockDriverDetailStats.totalOrders} />
            <StatCard label="Total de Entregas" value={mockDriverDetailStats.totalDeliveries} />
            <StatCard label="Pedidos Cancelados" value={mockDriverDetailStats.cancelledOrders} />
            <StatCard label="Ticket Médio" value={mockDriverDetailStats.averageTicket} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="% Cancelamento" value={mockDriverDetailStats.cancellationRate} />
            <StatCard
              label="Tempo Médio de Aceite"
              value={mockDriverDetailStats.averageAcceptTime}
            />
            <StatCard
              label="Tempo Médio de Coleta"
              value={mockDriverDetailStats.averageCollectTime}
            />
            <StatCard
              label="Tempo Médio de Entrega"
              value={mockDriverDetailStats.averageDeliveryTime}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Método de Pagamento Mais Usado"
              value={mockDriverDetailStats.mostUsedPaymentMethod}
            />
            <StatCard label="Total Ganho no Período" value={mockDriverDetailStats.totalEarned} />
            <StatCard label="Ranking no Período" value={mockDriverDetailStats.ranking} />
          </div>
        </TabsContent>

        <TabsContent value="orders" className="pt-4 text-sm text-muted-foreground">
          Lista de pedidos do entregador — estrutura equivalente à tela &quot;Pedidos&quot;.
        </TabsContent>

        <TabsContent value="wallet" className="space-y-4 pt-4">
          <div className="flex gap-2">
            <Button className="bg-green-600 hover:bg-green-700">Adicionar Saldo</Button>
            <Button variant="destructive">Remover Saldo</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Vr. Creditado</TableHead>
                <TableHead>Vr. Debitado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockWalletTransactions.map((transaction, index) => (
                <TableRow key={index}>
                  <TableCell>{transaction.date}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{transaction.status}</Badge>
                  </TableCell>
                  <TableCell>{transaction.description}</TableCell>
                  <TableCell>{transaction.creditedValue}</TableCell>
                  <TableCell>{transaction.debitedValue}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="withdrawals" className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockWithdrawalRequests.map((request, index) => (
                <TableRow key={index}>
                  <TableCell>{request.date}</TableCell>
                  <TableCell>{request.value}</TableCell>
                  <TableCell>
                    <Badge>{request.status}</Badge>
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
