'use client';

import { SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/nextjs';
import { CONTA_DISPONIVEL } from '@/lib/conta-da-loja';
import { textoSobre, type Paleta } from './paleta';

/**
 * A conta do CLIENTE da loja, que não tem relação com o login do painel.
 *
 * São duas autenticações no mesmo app: o painel usa `lib/session.ts` (JWT
 * próprio) e a loja usa Clerk. Elas não se enxergam, e é assim que tem que
 * ser — quem compra um açaí não é usuário do sistema de entregas.
 */

export interface Conta {
  /** Falso enquanto o Clerk ainda está descobrindo quem é. */
  carregada: boolean;
  usuarioId: string | null;
}

/**
 * Devolve `carregada` separado de `usuarioId` de propósito.
 *
 * Enquanto o Clerk carrega, o id é `null` — o mesmo valor de "ninguém entrou".
 * Confundir os dois faz a tela mostrar a porteira de login para quem já está
 * logado, e pior: faz um formulário que nasce preenchido a partir da conta
 * nascer vazio, porque na primeira renderização ainda não havia conta.
 */
function useContaDoClerk(): Conta {
  const { userId, isLoaded } = useAuth();
  return { carregada: isLoaded, usuarioId: isLoaded ? (userId ?? null) : null };
}

/** Sem Clerk neste deploy: ninguém entrou, e não há o que esperar carregar. */
function useSemConta(): Conta {
  return { carregada: true, usuarioId: null };
}

// Escolhida uma vez, no carregamento: o gancho é sempre o mesmo durante a vida
// da página, como a regra dos hooks exige.
export const useConta: () => Conta = CONTA_DISPONIVEL ? useContaDoClerk : useSemConta;

/** Atalho para quem só precisa do id e não se importa com o carregamento. */
export function useUsuarioId(): string | null {
  return useConta().usuarioId;
}

export function ControleDaConta({ paleta }: { paleta: Paleta }) {
  return CONTA_DISPONIVEL ? <ControleDoClerk paleta={paleta} /> : null;
}

function ControleDoClerk({ paleta }: { paleta: Paleta }) {
  const { isLoaded, isSignedIn } = useAuth();

  // Nada enquanto carrega: um botão "Entrar" que pisca e vira avatar é pior do
  // que um espaço vazio por meio segundo.
  if (!isLoaded) return <div className="size-7 shrink-0" aria-hidden="true" />;

  if (isSignedIn) {
    return (
      <div className="shrink-0">
        <UserButton />
      </div>
    );
  }

  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className="shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium"
        style={{ borderColor: paleta.linha, color: paleta.texto }}
      >
        Entrar
      </button>
    </SignInButton>
  );
}

/**
 * A porteira do checkout, com a sacola já montada atrás dela.
 *
 * Mostra o que a pessoa perde se desistir agora — o total que ela já escolheu
 * — em vez de uma parede genérica de login. E oferece criar conta ali, porque
 * quem chega aqui pela primeira vez não tem uma.
 */
export function PorteiraDeLogin({
  paleta,
  corDeAcao,
  textoDoBotao,
  resumo,
}: {
  paleta: Paleta;
  corDeAcao: string;
  textoDoBotao: string;
  resumo: string;
}) {
  if (!CONTA_DISPONIVEL) {
    return (
      <div className="space-y-2 px-4 py-6">
        <p className="text-base font-semibold">Pedidos por aqui em breve</p>
        <p className="text-sm" style={{ color: paleta.suave }}>
          Esta loja ainda não recebe pedidos pela página. Para pedir, fale com a loja.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 py-6">
      <p className="text-base font-semibold">Entre para finalizar</p>
      <p className="text-sm" style={{ color: paleta.suave }}>
        {resumo} A conta guarda seu endereço, para o próximo pedido ser só escolher e confirmar.
      </p>

      <SignInButton mode="modal">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold"
          style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
        >
          {textoDoBotao}
        </button>
      </SignInButton>

      <SignUpButton mode="modal">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center rounded-xl border text-sm font-semibold"
          style={{ borderColor: paleta.linha, color: paleta.texto }}
        >
          Criar conta
        </button>
      </SignUpButton>

      <p className="text-xs" style={{ color: paleta.suave }}>
        Sua sacola continua aqui enquanto você entra.
      </p>
    </div>
  );
}
