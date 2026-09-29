'use client';

import { FormularioDePromocao } from '@/components/loja/formulario-de-promocao';
import { session } from '@/lib/session';

export default function NovaPromocaoPage() {
  if (!session.getToken()) {
    return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  }
  return (
    <div className="space-y-5">
      <header>
        <h1>Nova promoção</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha onde vale e que desconto dar. Ela aparece no cardápio assim que for salva.
        </p>
      </header>
      <FormularioDePromocao />
    </div>
  );
}
