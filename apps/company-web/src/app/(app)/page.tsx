import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const COLLAPSIBLE_SECTIONS = [
  { label: 'Pedidos Buscando Entregador', count: 0 },
  { label: 'Pedidos em Andamento', count: 0 },
  { label: 'Entregadores', count: 0 },
];

export default function CompanyHomePage() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Lançar Pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full">Escolher Entregador</Button>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Coleta no endereço da loja</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                Rua Exemplo, 100 — Centro, Lajinha - MG
              </p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox /> Cobrar sobretaxa da coleta para o entregador
              </label>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="delivery-address">Endereço de entrega</Label>
              <Input id="delivery-address" placeholder="Buscar endereço..." />
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="street">Rua</Label>
                <Input id="street" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="number">Número</Label>
                <Input id="number" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="complement">Complemento</Label>
              <Input id="complement" />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox /> Solicitar recebimento na coleta
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox /> Exigir comprovante de entrega
              </label>
            </div>
          </CardContent>
        </Card>

        {COLLAPSIBLE_SECTIONS.map((section) => (
          <Card key={section.label}>
            <CardHeader className="flex-row items-center justify-between py-3">
              <CardTitle className="text-sm font-medium">{section.label}</CardTitle>
              <span className="text-sm text-muted-foreground">{section.count}</span>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="flex min-h-[500px] items-center justify-center overflow-hidden">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <MapPin className="size-8" />
          <p className="text-sm">Mapa (integração com Google Maps — Fase futura)</p>
        </div>
      </Card>
    </div>
  );
}
