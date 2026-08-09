import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function LaunchOrderPage() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <AlertCircle className="size-8" />
        <p className="text-sm font-medium">
          Estrutura equivalente à tela &quot;Lançar Pedido&quot; da Empresa
        </p>
        <p className="max-w-md text-xs">
          A referência visual não capturou uma tela distinta para o admin lançar pedidos em nome de
          uma empresa — presumivelmente reaproveita o mesmo formulário do painel Empresa (ver{' '}
          <code>company-web</code>, tela Home). Não implementado aqui para não inventar uma
          estrutura não confirmada.
        </p>
      </CardContent>
    </Card>
  );
}
