import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/components/stat-card';
import {
  mockDriverWallets,
  mockFinanceAnalytics,
  mockFinanceSummary,
  mockPendingInvoiceOrders,
  mockReceiptsByDay,
} from '@/lib/mock-data';

export default function FinancePage() {
  return (
    <Tabs defaultValue="dashboard">
      <TabsList>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="wallets">Carteiras Digitais</TabsTrigger>
        <TabsTrigger value="invoices">Controle de Faturas</TabsTrigger>
        <TabsTrigger value="receipts">Extrato de Recebimentos</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="space-y-6 pt-4">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Faturados</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Pedidos Ainda Sem Fatura" value={mockFinanceSummary.unbilledOrders} />
            <StatCard label="Faturas Pendentes" value={mockFinanceSummary.pendingInvoices} />
            <StatCard label="Faturas Vencidas" value={mockFinanceSummary.overdueInvoices} />
            <StatCard label="Valor Total a Receber" value={mockFinanceSummary.totalReceivable} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Carteiras</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Clientes — Saldo Disponível"
              value={mockFinanceSummary.clientWalletAvailable}
            />
            <StatCard
              label="Entregadores — Saldo Disponível"
              value={mockFinanceSummary.driverWalletAvailable}
            />
            <StatCard label="Saques Pendentes" value={mockFinanceSummary.pendingWithdrawals} />
            <StatCard label="Bloqueado nas Carteiras" value={mockFinanceSummary.blockedInWallets} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Dados Analíticos por Data</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start-date">Data Inicial</Label>
              <Input id="start-date" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-date">Data Final</Label>
              <Input id="end-date" type="date" />
            </div>
            <Button>Aplicar Filtro</Button>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Faturas Recebidas no Período"
              value={mockFinanceAnalytics.invoicesReceived}
            />
            <StatCard
              label="Saldos Adicionados de Clientes"
              value={mockFinanceAnalytics.clientBalanceAdded}
            />
            <StatCard
              label="Saldos Adicionados de Entregadores"
              value={mockFinanceAnalytics.driverBalanceAdded}
            />
            <StatCard
              label="Pagamentos Online de Pedidos"
              value={mockFinanceAnalytics.onlinePayments}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard
              label="Saques Solicitados"
              value={mockFinanceAnalytics.withdrawalsRequested}
            />
            <StatCard label="Saques Pagos" value={mockFinanceAnalytics.withdrawalsPaid} />
            <StatCard label="Saques Pendentes" value={mockFinanceAnalytics.withdrawalsPending} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard label="Total dos Entregadores" value={mockFinanceAnalytics.driverTotal} />
            <StatCard label="Total de Comissão" value={mockFinanceAnalytics.commissionTotal} />
            <StatCard label="Soma Total" value={mockFinanceAnalytics.grandTotal} />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="wallets" className="space-y-4 pt-4">
        <Input placeholder="Buscar entregador..." className="max-w-xs" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Entregador</TableHead>
              <TableHead>Saldo Disponível</TableHead>
              <TableHead>Saldo Bloqueado</TableHead>
              <TableHead>Saques Solicitados</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockDriverWallets.map((wallet, index) => (
              <TableRow key={wallet.name}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{wallet.name}</TableCell>
                <TableCell>{wallet.available}</TableCell>
                <TableCell>{wallet.blocked}</TableCell>
                <TableCell>{wallet.requested}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline">
                    Abrir Carteira
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TabsContent>

      <TabsContent
        value="invoices"
        className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-[1fr_320px]"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-start">Data Inicial</Label>
              <Input id="inv-start" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-end">Data Final</Label>
              <Input id="inv-end" type="date" />
            </div>
            <Button variant="outline">Filtrar</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Selecione os pedidos para marcar o pagamento
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>ID</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vr. Entregador</TableHead>
                <TableHead>Vr. App</TableHead>
                <TableHead>Vr. Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockPendingInvoiceOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell>#{order.id}</TableCell>
                  <TableCell>{order.date}</TableCell>
                  <TableCell>{order.client}</TableCell>
                  <TableCell>{order.driverValue}</TableCell>
                  <TableCell>{order.appValue}</TableCell>
                  <TableCell>{order.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Resumo do Pagamento</h3>
          <div className="space-y-1.5">
            <Label htmlFor="due-date">Data de Vencimento</Label>
            <Input id="due-date" type="date" />
          </div>
          <Button className="w-full">Gerar Todas as Faturas</Button>
          <p className="text-center text-xs text-muted-foreground">ou</p>
          <Button className="w-full" variant="secondary">
            Marcar Todos Pedidos como Pagos
          </Button>
          <Button className="w-full" variant="outline">
            Marcar Manualmente como Pago
          </Button>
          <Button className="w-full" variant="ghost">
            Imprimir Relatório de Pedidos
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="receipts" className="space-y-4 pt-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="rec-start">Data Inicial</Label>
            <Input id="rec-start" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-end">Data Final</Label>
            <Input id="rec-end" type="date" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox /> Somente pagos online
          </label>
          <Button>Aplicar Filtro</Button>
        </div>

        {mockReceiptsByDay.map((day) => (
          <div key={day.date} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-sm font-medium">
              <span>{day.date}</span>
              <span>Total: {day.total}</span>
            </div>
            <div className="divide-y">
              {day.invoices.map((invoice) => (
                <div
                  key={invoice.number}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span className="text-primary underline-offset-2 hover:underline">
                    Fatura #{invoice.number} — {invoice.client}
                  </span>
                  <span>{invoice.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </TabsContent>
    </Tabs>
  );
}
