import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/components/stat-card';
import { mockClientDetailStats } from '@/lib/mock-data';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientName = decodeURIComponent(id);

  return (
    <div className="space-y-4">
      <Link href="/clientes" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> Voltar para Clientes
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Painel do Cliente: {clientName}</h1>
        <Button variant="outline">Editar Cliente</Button>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="orders">Pedidos do Cliente</TabsTrigger>
          <TabsTrigger value="wallet">Carteira Digital</TabsTrigger>
          <TabsTrigger value="invoices">Faturas</TabsTrigger>
          <TabsTrigger value="addresses">Endereços Favoritos</TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Saldo da Carteira" value={mockClientDetailStats.walletBalance} />
            <StatCard label="Último Pedido" value={mockClientDetailStats.lastOrder} />
            <StatCard label="Primeiro Pedido" value={mockClientDetailStats.firstOrder} />
            <StatCard label="Total Geral" value={mockClientDetailStats.totalSpent} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total de Pedidos" value={mockClientDetailStats.totalOrders} />
            <StatCard label="Pedidos Cancelados" value={mockClientDetailStats.cancelledOrders} />
            <StatCard label="Ticket Médio" value={mockClientDetailStats.averageTicket} />
            <StatCard label="% Cancelamento" value={mockClientDetailStats.cancellationRate} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Tempo Médio de Entrega"
              value={mockClientDetailStats.averageDeliveryTime}
            />
            <StatCard label="Serviço mais usado" value={mockClientDetailStats.mostUsedService} />
            <StatCard
              label="Método de Pagamento mais usado"
              value={mockClientDetailStats.mostUsedPaymentMethod}
            />
            <StatCard label="Total em Comissão" value={mockClientDetailStats.totalCommission} />
          </div>
        </TabsContent>

        <TabsContent value="orders" className="pt-4 text-sm text-muted-foreground">
          Lista de pedidos do cliente — estrutura equivalente à tela &quot;Pedidos&quot;.
        </TabsContent>
        <TabsContent value="wallet" className="pt-4 text-sm text-muted-foreground">
          Carteira digital do cliente — estrutura equivalente à Carteira Digital do Financeiro.
        </TabsContent>
        <TabsContent value="invoices" className="pt-4 text-sm text-muted-foreground">
          Faturas do cliente — estrutura equivalente à tela &quot;Faturas&quot;.
        </TabsContent>
        <TabsContent value="addresses" className="pt-4 text-sm text-muted-foreground">
          Endereços favoritos cadastrados pelo cliente.
        </TabsContent>
        <TabsContent value="team" className="pt-4 text-sm text-muted-foreground">
          Equipe (usuários) vinculada a este cliente.
        </TabsContent>
      </Tabs>
    </div>
  );
}
