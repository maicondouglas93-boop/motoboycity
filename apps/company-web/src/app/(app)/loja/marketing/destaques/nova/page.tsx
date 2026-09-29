'use client';

import { FormularioDeDestaque } from '@/components/loja/formulario-de-destaque';
import { session } from '@/lib/session';

export default function NovoDestaquePage() {
  if (!session.getToken()) {
    return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  }
  return (
    <div className="space-y-5">
      <header>
        <h1>Novo destaque</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha um título e os produtos que vão aparecer no alto do cardápio.
        </p>
      </header>
      <FormularioDeDestaque />
    </div>
  );
}
