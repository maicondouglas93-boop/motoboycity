'use client';

import { useState, useSyncExternalStore } from 'react';
import { CONTA_DISPONIVEL } from '@/lib/conta-da-loja';
import { aoMudarOCliente, entrarComGoogle, sair } from '@/lib/firebase-da-loja';
import { textoSobre, type Paleta } from './paleta';

/**
 * A conta do CLIENTE da loja, que não tem relação com o login do painel.
 *
 * São duas autenticações no mesmo app: o painel usa `lib/session.ts` (JWT
 * próprio) e a loja usa o login do Firebase, só com Google. Elas não se
 * enxergam, e é assim que tem que ser — quem compra um açaí não é usuário do
 * sistema de entregas.
 */

export interface Conta {
  /** Falso enquanto o Firebase ainda está descobrindo quem é. */
  carregada: boolean;
  usuarioId: string | null;
  nome: string | null;
  foto: string | null;
}

const CARREGANDO: Conta = { carregada: false, usuarioId: null, nome: null, foto: null };
const NINGUEM: Conta = { carregada: true, usuarioId: null, nome: null, foto: null };

/*
 * Uma assinatura só do Firebase para a página inteira, e não uma por
 * componente: a sacola, o cabeçalho e os avisos leem o mesmo estado.
 */
let atual: Conta = CARREGANDO;
const ouvintes = new Set<() => void>();
let assinado = false;

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  if (!assinado) {
    assinado = true;
    aoMudarOCliente((usuario) => {
      atual = usuario
        ? {
            carregada: true,
            usuarioId: usuario.uid,
            nome: usuario.displayName,
            foto: usuario.photoURL,
          }
        : NINGUEM;
      for (const avisar of ouvintes) avisar();
    });
  }
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/**
 * Devolve `carregada` separado de `usuarioId` de propósito.
 *
 * Enquanto o Firebase carrega, o id é `null` — o mesmo valor de "ninguém
 * entrou". Confundir os dois faz a tela mostrar a porteira de login para quem
 * já está logado, e pior: faz um formulário que nasce preenchido a partir da
 * conta nascer vazio, porque na primeira renderização ainda não havia conta.
 */
function useContaDoFirebase(): Conta {
  return useSyncExternalStore(
    assinar,
    () => atual,
    () => CARREGANDO,
  );
}

/** Sem o Firebase neste deploy: ninguém entrou, e não há o que esperar carregar. */
function useSemConta(): Conta {
  return NINGUEM;
}

// Escolhida uma vez, no carregamento: o gancho é sempre o mesmo durante a vida
// da página, como a regra dos hooks exige.
export const useConta: () => Conta = CONTA_DISPONIVEL ? useContaDoFirebase : useSemConta;

/** Atalho para quem só precisa do id e não se importa com o carregamento. */
export function useUsuarioId(): string | null {
  return useConta().usuarioId;
}

export function ControleDaConta({ paleta }: { paleta: Paleta }) {
  return CONTA_DISPONIVEL ? <ControleDoFirebase paleta={paleta} /> : null;
}

function ControleDoFirebase({ paleta }: { paleta: Paleta }) {
  const conta = useConta();
  const [menuAberto, setMenuAberto] = useState(false);

  // Nada enquanto carrega: um botão "Entrar" que pisca e vira foto é pior do
  // que um espaço vazio por meio segundo.
  if (!conta.carregada) return <div className="size-8 shrink-0" aria-hidden="true" />;

  if (conta.usuarioId) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Sua conta"
          aria-expanded={menuAberto}
          onClick={() => setMenuAberto((aberto) => !aberto)}
          className="flex size-8 items-center justify-center overflow-hidden rounded-full border text-sm font-semibold"
          style={{ borderColor: paleta.linha, color: paleta.texto }}
        >
          {conta.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={conta.foto}
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            (conta.nome ?? '?').charAt(0).toUpperCase()
          )}
        </button>
        {menuAberto && (
          <div
            className="absolute right-0 z-30 mt-2 w-52 rounded-lg border p-1.5 text-sm shadow-lg"
            style={{ backgroundColor: paleta.fundo, borderColor: paleta.linha }}
          >
            {conta.nome && <p className="truncate px-2 py-1.5 font-medium">{conta.nome}</p>}
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left"
              onClick={() => {
                setMenuAberto(false);
                void sair();
              }}
            >
              Sair
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void entrarComGoogle()}
      className="shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium"
      style={{ borderColor: paleta.linha, color: paleta.texto }}
    >
      Entrar
    </button>
  );
}

/**
 * A porteira do checkout, com a sacola já montada atrás dela.
 *
 * Mostra o que a pessoa perde se desistir agora — o total que ela já escolheu
 * — em vez de uma parede genérica de login. Com o Google não há conta a criar:
 * quem tem celular Android já tem uma.
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
  const [aviso, setAviso] = useState<string | null>(null);

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

  async function entrar() {
    setAviso(null);
    const resultado = await entrarComGoogle();
    if (resultado === 'FALHOU') {
      setAviso('Não deu para entrar com o Google agora. Tente de novo em instantes.');
    }
  }

  return (
    <div className="space-y-3 px-4 py-6">
      <p className="text-base font-semibold">Entre para finalizar</p>
      <p className="text-sm" style={{ color: paleta.suave }}>
        {resumo} Entre com sua conta Google: ela guarda seu endereço, para o próximo pedido ser só
        escolher e confirmar.
      </p>

      <button
        type="button"
        onClick={() => void entrar()}
        className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold"
        style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
      >
        {textoDoBotao}
      </button>

      {aviso && (
        <p className="text-sm" role="alert">
          {aviso}
        </p>
      )}

      <p className="text-xs" style={{ color: paleta.suave }}>
        Sua sacola continua aqui enquanto você entra.
      </p>
    </div>
  );
}
