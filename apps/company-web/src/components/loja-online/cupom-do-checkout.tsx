'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import type { CupomDisponivel, CupomPublico } from '@motoboycity/types';
import {
  aplicarCupom,
  emReais,
  mensagemDoCupom,
  type LinhaPrecificada,
  type ResultadoDoCupom,
} from '@motoboycity/validation';
import { publicStoreOrdersApi } from '@/lib/api-client';
import { tokenDoCliente } from '@/lib/firebase-da-loja';
import { condicoesDoCupom, descricaoDoCupom } from '@/lib/loja-cupons';
import type { ItemEscolhido } from '@/components/loja-online/folha-do-produto';
import { Campo } from '@/components/loja-online/campos-do-checkout';
import estilos from '@/components/loja-online/loja.module.css';
import { moeda, textoSobre, type Paleta } from '@/components/loja-online/paleta';

/**
 * A área "Cupons" do checkout.
 *
 * O cliente vê os cupons que a loja quis mostrar e que ainda valem para ELE agora (ligados,
 * nas datas, com uso, dentro do limite dele) e aplica um com um toque. Cada cartão diz, para
 * a sacola de agora, quanto ele desconta — ou por que não serve (o pedido mínimo, os itens já
 * em promoção) —, pela MESMA regra do servidor (`aplicarCupom`), recalculada a cada mudança da
 * sacola. O melhor desconto vem marcado.
 *
 * Quem tem um código que não está na lista (o cupom secreto de um convite) o digita: o servidor
 * o confere para o cliente e para esta sacola, como na lista. Aplicado o cupom, a área vira
 * uma linha com "Remover". O que a lista mostra é só conveniência: ao aplicar e ao fazer o
 * pedido, o servidor confere tudo de novo.
 */

type Lista =
  { tipo: 'carregando' } | { tipo: 'pronto'; cupons: CupomDisponivel[] } | { tipo: 'falhou' };

/**
 * Lê a lista uma vez, e de novo quando o cupom aplicado sai (`ativo` volta a ser verdadeiro):
 * o cupom que acabou de falhar no pedido não pode continuar na lista.
 */
function useCuponsDisponiveis(slug: string, ativo: boolean): Lista {
  const [lista, setLista] = useState<Lista>({ tipo: 'carregando' });

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    void (async () => {
      try {
        const token = await tokenDoCliente();
        if (!token) {
          if (vivo) setLista({ tipo: 'falhou' });
          return;
        }
        const cupons = await publicStoreOrdersApi.cuponsDisponiveis(slug, token);
        if (vivo) setLista({ tipo: 'pronto', cupons });
      } catch {
        if (vivo) setLista({ tipo: 'falhou' });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [slug, ativo]);

  return lista;
}

/** Um cupom da lista, já avaliado contra a sacola de agora. */
export interface CupomAvaliado {
  cupom: CupomDisponivel;
  resultado: ResultadoDoCupom;
  /** É o que mais desconta, entre vários que servem. */
  melhor: boolean;
}

/** Os cartões da lista "Cupons": cada um com o que faz, o que dá a esta sacola e o botão. */
export function CartoesDeCupom({
  avaliados,
  aplicando,
  paleta,
  corDaMarca,
  corDeAcao,
  aoAplicar,
}: {
  avaliados: CupomAvaliado[];
  /** O código que está sendo conferido; trava os outros botões. */
  aplicando: string | null;
  paleta: Paleta;
  corDaMarca: string;
  corDeAcao: string;
  aoAplicar: (codigo: string) => void;
}) {
  return (
    <ul className="mt-2 space-y-2">
      {avaliados.map(({ cupom, resultado, melhor }) => (
        <li
          key={cupom.codigo}
          className="flex items-start gap-3 rounded-lg border p-3"
          style={{ borderColor: paleta.contorno }}
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-bold tracking-wide">{cupom.codigo}</span>
              {melhor && (
                <span
                  className="rounded px-1.5 py-0.5 text-[11px] leading-none font-bold"
                  style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
                >
                  Melhor desconto
                </span>
              )}
            </p>
            <p className="mt-0.5 text-sm">{descricaoDoCupom(cupom)}</p>
            {resultado.ok ? (
              <p className="mt-0.5 text-sm font-medium" style={{ color: corDaMarca }}>
                Você economiza {moeda(emReais(resultado.descontoCentavos))} nesta sacola
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-pretty" style={{ color: paleta.suave }}>
                {mensagemDoCupom(resultado)}
              </p>
            )}
            <p className="mt-1 text-xs text-pretty" style={{ color: paleta.suave }}>
              {condicoesDoCupom(cupom).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Aplicar o cupom ${cupom.codigo}`}
            disabled={!resultado.ok || aplicando !== null}
            onClick={() => aoAplicar(cupom.codigo)}
            className={`${estilos['foco']} inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50`}
            style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
          >
            {aplicando === cupom.codigo ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                Aplicando…
              </>
            ) : (
              'Aplicar'
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CupomDoCheckout({
  slug,
  itens,
  regra,
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
  /** As linhas da sacola já com as promoções: é sobre elas que se vê o que cada cupom dá. */
  regra: LinhaPrecificada[];
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
  // O código que está sendo conferido: o do cartão tocado, ou o digitado.
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const lista = useCuponsDisponiveis(slug, aplicado === null);

  /*
   * O que cada cupom dá à sacola de agora, e por que não dá. Os que servem vêm primeiro, do
   * maior desconto para o menor; os que não servem, atrás, com o motivo. O melhor só é
   * marcado quando há mais de um que serve: sozinho, "melhor" não diz nada.
   */
  const avaliados = useMemo(() => {
    if (lista.tipo !== 'pronto') return [];
    const todos = lista.cupons.map((cupom) => ({ cupom, resultado: aplicarCupom(regra, cupom) }));
    const servem = todos
      .filter((item) => item.resultado.ok)
      .sort(
        (a, b) =>
          (b.resultado.ok ? b.resultado.descontoCentavos : 0) -
          (a.resultado.ok ? a.resultado.descontoCentavos : 0),
      );
    const naoServem = todos.filter((item) => !item.resultado.ok);
    return [...servem, ...naoServem].map((item, indice) => ({
      ...item,
      melhor: servem.length > 1 && indice === 0,
    }));
  }, [lista, regra]);

  async function aplicar(digitado: string) {
    setAplicando(digitado);
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
      setAplicando(null);
    }
  }

  function aoEnviarOCodigo(evento: FormEvent) {
    evento.preventDefault();
    const digitado = codigo.trim();
    if (digitado === '') {
      setErro('Digite o código do cupom.');
      return;
    }
    void aplicar(digitado);
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

  return (
    <section
      aria-labelledby="cupons-titulo"
      className="px-4 py-3"
      style={{ borderTop: `1px solid ${paleta.linha}` }}
    >
      <h2 id="cupons-titulo" className="text-base font-semibold">
        Cupons
      </h2>

      {lista.tipo === 'carregando' && (
        <p className="mt-1 text-sm" style={{ color: paleta.suave }} role="status">
          Procurando cupons para você…
        </p>
      )}
      {lista.tipo === 'falhou' && (
        <p className="mt-1 text-sm" style={{ color: paleta.suave }}>
          Não deu para carregar a lista de cupons agora.
        </p>
      )}
      {lista.tipo === 'pronto' && lista.cupons.length === 0 && (
        <p className="mt-1 text-sm" style={{ color: paleta.suave }}>
          Nenhum cupom disponível no momento.
        </p>
      )}

      {avaliados.length > 0 && (
        <CartoesDeCupom
          avaliados={avaliados}
          aplicando={aplicando}
          paleta={paleta}
          corDaMarca={corDaMarca}
          corDeAcao={corDeAcao}
          aoAplicar={(digitado) => void aplicar(digitado)}
        />
      )}

      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={`${estilos['foco']} -ml-2 mt-1 min-h-11 rounded-lg px-2 text-sm font-semibold underline`}
          style={{ color: corDaMarca }}
        >
          Tem um código de cupom?
        </button>
      )}
      {aberto && (
        <form onSubmit={aoEnviarOCodigo} className="mt-2">
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
              disabled={aplicando !== null}
              className={`${estilos['foco']} inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-70`}
              style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
            >
              {aplicando !== null && aplicando === codigo.trim() ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                  Aplicando…
                </>
              ) : (
                'Aplicar'
              )}
            </button>
          </div>
        </form>
      )}

      {erro && (
        <p
          className="mt-1.5 text-sm font-medium text-pretty"
          style={{ color: paleta.erro }}
          role="alert"
        >
          {erro}
        </p>
      )}
    </section>
  );
}
