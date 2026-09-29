'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import type { CupomPublico } from '@motoboycity/types';
import { publicStoreOrdersApi } from '@/lib/api-client';
import { tokenDoCliente } from '@/lib/firebase-da-loja';
import type { ItemEscolhido } from '@/components/loja-online/folha-do-produto';
import { Campo } from '@/components/loja-online/campos-do-checkout';
import estilos from '@/components/loja-online/loja.module.css';
import type { Paleta } from '@/components/loja-online/paleta';
import { textoSobre } from '@/components/loja-online/paleta';

/**
 * "Tem um cupom?" no checkout.
 *
 * O cliente digita o código e o servidor o confere para ELE e para esta sacola
 * (`conferirCupom`): existe na loja, está ligado, dentro das datas, com uso, e
 * dentro do limite por cliente. A resposta traz as regras do cupom — e a página
 * recalcula o desconto sozinha, pela mesma regra do servidor, a cada mudança da
 * sacola; o que ela recalcula e não vale mais (o pedido mínimo, por exemplo)
 * aparece aqui como `recusa`, sem tirar o cupom.
 *
 * O cupom só vale em item sem promoção — a frase da recusa diz isso quando é o
 * caso. Cada erro do servidor vem com o motivo escrito em português.
 */
export function CupomDoCheckout({
  slug,
  itens,
  aplicado,
  recusa,
  paleta,
  corDaMarca,
  corDeAcao,
  aoAplicar,
  aoRemover,
}: {
  slug: string;
  itens: ItemEscolhido[];
  /** O cupom que o cliente aplicou, ou `null`. */
  aplicado: CupomPublico | null;
  /** Por que o cupom aplicado não vale para a sacola de agora, ou `null` se vale. */
  recusa: string | null;
  paleta: Paleta;
  corDaMarca: string;
  corDeAcao: string;
  aoAplicar: (cupom: CupomPublico) => void;
  aoRemover: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aplicar(evento: FormEvent) {
    evento.preventDefault();
    const digitado = codigo.trim();
    if (digitado === '') {
      setErro('Digite o código do cupom.');
      return;
    }
    setAplicando(true);
    setErro(null);
    try {
      const token = await tokenDoCliente();
      if (!token) {
        setErro('Sua sessão expirou. Entre de novo para usar o cupom.');
        return;
      }
      const conferencia = await publicStoreOrdersApi.conferirCupom(slug, token, {
        cupom: digitado,
        itens: itens.map((item) => ({
          produtoId: item.produtoId,
          tamanhoId: item.tamanhoId ?? null,
          escolhas: item.escolhaIds ?? [],
          quantidade: item.quantidade,
        })),
      });
      setCodigo('');
      setAberto(false);
      aoAplicar(conferencia.cupom);
    } catch (falha) {
      setErro(
        falha instanceof ApiError && falha.message
          ? falha.message
          : 'Não deu para conferir o cupom agora. Confira a internet e tente de novo.',
      );
    } finally {
      setAplicando(false);
    }
  }

  if (aplicado) {
    return (
      <div className="px-4 py-3" style={{ borderTop: `1px solid ${paleta.linha}` }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            Cupom <span className="font-bold tracking-wide">{aplicado.codigo}</span>
          </p>
          <button
            type="button"
            onClick={aoRemover}
            className={`${estilos['foco']} -mr-2 min-h-11 rounded-lg px-2 text-sm font-semibold underline`}
            style={{ color: corDaMarca }}
          >
            Remover
          </button>
        </div>
        {recusa && (
          <p
            className="mt-1 text-sm font-medium text-pretty"
            style={{ color: paleta.erro }}
            role="status"
          >
            {recusa}
          </p>
        )}
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className="px-4 py-1" style={{ borderTop: `1px solid ${paleta.linha}` }}>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={`${estilos['foco']} -ml-2 min-h-11 rounded-lg px-2 text-sm font-semibold underline`}
          style={{ color: corDaMarca }}
        >
          Tem um cupom de desconto?
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(evento) => void aplicar(evento)}
      className="px-4 py-3"
      style={{ borderTop: `1px solid ${paleta.linha}` }}
    >
      <div className="flex items-end gap-2">
        <Campo
          id="cupom"
          rotulo="Código do cupom"
          valor={codigo}
          aoMudar={(valor) => {
            setCodigo(valor.toUpperCase());
            setErro(null);
          }}
          paleta={paleta}
          maxLength={40}
          className="min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={aplicando}
          className={`${estilos['foco']} inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-70`}
          style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
        >
          {aplicando ? (
            <>
              <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              Aplicando…
            </>
          ) : (
            'Aplicar'
          )}
        </button>
      </div>
      {erro && (
        <p
          className="mt-1.5 text-sm font-medium text-pretty"
          style={{ color: paleta.erro }}
          role="alert"
        >
          {erro}
        </p>
      )}
    </form>
  );
}
