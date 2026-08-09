import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function IAGoPage() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <AlertCircle className="size-8" />
        <p className="text-sm font-medium">Tela &quot;IAGo&quot; não especificada na Fase 0</p>
        <p className="max-w-md text-xs">
          O ícone aparece na navegação da referência visual, mas nenhuma captura de tela do seu
          conteúdo foi fornecida. Estrutura pendente de definição — ver lacunas registradas no
          documento de análise da Fase 0.
        </p>
      </CardContent>
    </Card>
  );
}
