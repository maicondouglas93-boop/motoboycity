'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/brand/wordmark';
import { session } from '@/lib/session';

/**
 * Primeira tela depois do cadastro — a primeira impressão de um cliente novo.
 *
 * Antes era um cartão no vazio dizendo "aguarde", sem contar o que acontece
 * depois nem oferecer saída: quem chegava aqui ficava preso, inclusive sem
 * conseguir sair da conta.
 */
export default function PendingApprovalPage() {
  const router = useRouter();

  function handleLogout() {
    session.clearToken();
    router.replace('/login');
  }

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-none">
      <aside className="flex flex-row items-center justify-between gap-4 bg-asfalto px-6 py-4 text-white lg:flex-col lg:items-stretch lg:justify-between lg:px-12 lg:py-14">
        <Wordmark />
        <p className="font-mono text-[10px] tracking-wide whitespace-nowrap text-white/40 uppercase lg:text-[11px]">
          Lajinha · MG
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            Cadastro enviado
          </p>
          <h1 className="font-heading mt-2 text-3xl leading-tight font-bold tracking-tight text-balance">
            Estamos conferindo os dados da sua empresa.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            A aprovação é manual e feita pela nossa equipe. Assim que ela sair, você entra com o
            mesmo e-mail e senha que acabou de cadastrar — e já pode chamar o primeiro motoboy.
          </p>

          <div className="mt-8 space-y-3 border-t pt-6 text-sm">
            <p className="text-muted-foreground">
              Precisa corrigir algum dado ou tem pressa? Fale com quem indicou o MOTOboyCity para a
              sua loja.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/login"
                className="font-medium underline decoration-colete decoration-2 underline-offset-4"
              >
                Tentar entrar
              </Link>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
