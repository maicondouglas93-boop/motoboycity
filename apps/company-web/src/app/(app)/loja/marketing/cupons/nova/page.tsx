'use client';

import { FormularioDeCupom } from '@/components/loja/formulario-de-cupom';
import { session } from '@/lib/session';

export default function NovoCupomPage() {
  if (!session.getToken()) {
    return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  }
  return (
    <div className="space-y-5">
      <header>
        <h1>Novo cupom</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o código e o desconto. O cliente digita o código no checkout da sua loja.
        </p>
      </header>
      <FormularioDeCupom />
    </div>
  );
}
