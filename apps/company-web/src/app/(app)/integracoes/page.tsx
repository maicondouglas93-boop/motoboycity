import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mockIntegrations } from '@/lib/mock-data';

export default function CompanyIntegrationsPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Integrações Disponíveis</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {mockIntegrations.map((integration) => (
            <Card key={integration} className="cursor-pointer transition-colors hover:bg-accent">
              <CardContent className="flex items-center gap-3 py-4">
                <Plug className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">{integration}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AnyFone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="default-driver">Forma de Repasse Padrão</Label>
            <Select>
              <SelectTrigger id="default-driver">
                <SelectValue placeholder="Selecione uma forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Valor fixo</SelectItem>
                <SelectItem value="percentage">Percentual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default-plate">Placa Padrão</Label>
            <Select>
              <SelectTrigger id="default-plate">
                <SelectValue placeholder="Selecione uma placa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox className="mt-0.5" />
            Habilitar retorno automático
          </label>

          <div className="flex items-center gap-2 text-sm">
            <span>Ao receber pedido de entrega, chamar entregador após aproximadamente</span>
            <Input className="w-20" defaultValue={30} type="number" />
            <span>segundos</span>
          </div>

          <div className="flex gap-2 pt-2">
            <Button>Salvar e Concluir</Button>
            <Button variant="outline">Fechar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
