import Link from 'next/link';
import { Copy, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/stat-card';
import {
  mockBlockedDrivers,
  mockDriverSignupLink,
  mockDriverStats,
  mockDrivers,
  mockPendingDrivers,
} from '@/lib/mock-data';

export default function DriversPage() {
  return (
    <div className="space-y-6">
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-sm font-medium">{mockPendingDrivers} Entregadores Pendentes</p>
            <p className="text-xs text-muted-foreground">
              Entregadores aguardando aprovação para começar a trabalhar
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">Ver Pendentes</Button>
            <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
              {mockDriverSignupLink}
              <Copy className="size-3.5 cursor-pointer" />
              <ExternalLink className="size-3.5 cursor-pointer" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-sm font-medium">
              {mockBlockedDrivers} Entregadores Suspensos/Bloqueados
            </p>
            <p className="text-xs text-muted-foreground">
              Entregadores bloqueados ou suspensos que precisam de atenção
            </p>
          </div>
          <Button variant="destructive">Ver Bloqueados</Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Total de Entregas" value={mockDriverStats.totalDeliveries} />
          <StatCard label="Online Agora" value={mockDriverStats.onlineNow} />
        </div>
        <Button>Novo Entregador</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Entregadores Cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="h-32 rounded bg-muted/40" />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ranking de Entregadores</CardTitle>
          </CardHeader>
          <CardContent className="h-32 rounded bg-muted/40" />
        </Card>
      </div>

      <Input placeholder="Buscar entregador..." className="max-w-xs" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockDrivers.map((driver) => (
          <Card key={driver.name}>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-start justify-between">
                <p className="font-medium">{driver.name}</p>
                {driver.status === 'Suspenso' && <Badge variant="destructive">Suspenso</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{driver.phone}</p>
              <p className="text-xs text-muted-foreground">
                Versão do App: {driver.appVersion} · Tipo de serviço: {driver.serviceType}
              </p>
              <p className="text-xs text-muted-foreground">
                Ativo Agora: {driver.active ? 'Sim' : 'Não'} · Último local: {driver.lastSeen}
              </p>
              <Link
                href={`/entregadores/${encodeURIComponent(driver.name)}`}
                className={buttonVariants({ variant: 'outline', className: 'w-full' })}
              >
                Abrir Entregador
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
