'use client';

import { Suspense, use, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Bell, BellRing, ChevronLeft, Clock, MapPin, Store } from 'lucide-react';
import { LOJA_DE_EXEMPLO } from '@/lib/loja-mock';
import { useOperacao, useVendas } from '@/lib/loja-demo';
import { hora, momentoNaLoja, rotuloDoDia } from '@/lib/loja-horario';
import {
  caminhoDoPedido,
  concluido,
  etapaParaOCliente,
  previsaoParaOCliente,
} from '@/lib/loja-pedido';
import type { VendaDaLoja } from '@/lib/loja-mock';
import {
  pedirPermissaoDeNotificacao,
  permissaoDeNotificacao,
  type PermissaoDeNotificacao,
} from '@/lib/avisos-do-navegador';
import { useAgora } from '@/lib/relogio';
import { moeda, paletaDoTema, type Paleta } from '@/components/loja-online/paleta';
import {
  useHidratado,
  usePedidos,
  type PedidoGuardado,
} from '@/components/loja-online/armazenamento';
import { PorteiraDeLogin, useConta } from '@/components/loja-online/conta';
import { ConfirmacaoDoPedido } from '@/components/loja-online/confirmacao';
import { ConviteParaInstalar } from '@/components/loja-online/convite-para-instalar';

/**
 * Onde o cliente responde sozinho a pergunta que ele faria à loja no WhatsApp:
 * "cadê meu pedido?".
 *
 * Cada pedido diz em que etapa está — recebido, aceito, em preparação, pronto,
 * a caminho, entregue — e anda sozinho quando a loja mexe nele. Na
 * demonstração, isso vale com o painel aberto em outra aba do mesmo navegador.
 *
 * Não há aba para cá no rodapé de propósito: o link só existe depois do
 * primeiro pedido. Uma aba vazia para todo visitante novo ocuparia a faixa da
 * tela que decide a venda sem dizer nada.
 */

/** Vermelho do cancelamento: a paleta da loja não tem cor de erro, e ali ela precisa de uma. */
const COR_DO_CANCELAMENTO = '#b91c1c';

/**
 * A previsão de um pedido sem acompanhamento — feito antes de as etapas
 * existirem. Na entrega é uma janela; na retirada, a partir de quando dá para
 * buscar.
 */
function previsaoSemAcompanhamento(pedido: PedidoGuardado): string {
  const pronto = new Date(new Date(pedido.criadoEm).getTime() + pedido.minutosDePreparo * 60_000);
  if (pedido.retirarNaLoja) return `Pronto para retirar a partir de ${hora(pronto)}`;
  const chega = new Date(pronto.getTime() + (pedido.minutosDeEntrega ?? 15) * 60_000);
  const ate = new Date(chega.getTime() + 15 * 60_000);
  return `Chega entre ${hora(chega)} e ${hora(ate)}`;
}

/*
 * `useSearchParams` obriga a uma fronteira de Suspense: sem ela o `next build`
 * recusa a rota. Fica isolado no componente de baixo para o resto da tela
 * continuar renderizando enquanto o parâmetro não chega.
 */
export default function PedidosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <Suspense fallback={null}>
      <Conteudo slug={slug} />
    </Suspense>
  );
}

function Conteudo({ slug }: { slug: string }) {
  const loja = LOJA_DE_EXEMPLO;
  const paleta = paletaDoTema(loja.tema);
  const conta = useConta();
  const usuarioId = conta.usuarioId;
  const pedidos = usePedidos(slug, usuarioId);
  const vendas = useVendas();
  const operacao = useOperacao();
  const instante = useAgora();
  // Mesma razão da sacola: enquanto o Clerk carrega, `usuarioId` é null e a
  // tela mostraria a porteira de login para quem já entrou.
  const pronto = useHidratado() && conta.carregada;

  const novo = Number(useSearchParams().get('novo')) || null;

  /** O andamento do pedido, como a loja o vê. Só da conta certa. */
  function andamentoDe(pedido: PedidoGuardado): VendaDaLoja | null {
    return (
      vendas.find(
        (venda) => venda.numero === pedido.numero && venda.contaDoCliente === usuarioId,
      ) ?? null
    );
  }

  /*
   * A confirmação só vale para o pedido MAIS RECENTE.
   *
   * O `?novo=` fica na URL depois de um recarregamento ou de voltar pelo
   * histórico. Se o cliente fez outro pedido desde então, a confirmação daquele
   * ficou velha — e mostrá-la presa ao terceiro pedido da lista, no meio da
   * página, foi exatamente o que aconteceu numa versão anterior.
   */
  const recemFeito = novo !== null && pedidos[0]?.numero === novo ? pedidos[0] : null;
  const agora = new Date(instante);

  const algumEmAndamento = pedidos.some((pedido) => {
    const andamento = andamentoDe(pedido);
    return andamento !== null && !concluido(andamento.etapa);
  });

  const enderecoDeRetirada = operacao.retirada.endereco ?? loja.pontoDeColeta;

  return (
    <div className="min-h-dvh" style={{ backgroundColor: paleta.fundo, color: paleta.texto }}>
      <div className="h-1" style={{ backgroundColor: loja.corDaMarca }} />

      <div className="mx-auto w-full max-w-lg pb-10">
        <header
          className="flex items-center gap-2 border-b px-3 py-3"
          style={{ borderColor: paleta.linha }}
        >
          <Link href={`/pedir/${slug}`} aria-label="Voltar ao cardápio" className="-ml-1 p-1">
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-lg font-bold">Meus pedidos</h1>
        </header>

        {/* O momento do pedido feito fica no topo, sozinho, e não dentro do
            cartão: é a primeira coisa que o cliente vê ao chegar aqui. O
            convite de instalar vem logo depois, e não antes. */}
        {recemFeito && (
          <section className="border-b px-4 pt-4 pb-4" style={{ borderColor: paleta.linha }}>
            <ConfirmacaoDoPedido
              cor={loja.corDeAcao}
              numero={recemFeito.numero}
              agendadoPara={
                recemFeito.janela && pronto
                  ? `${rotuloDoDia(momentoNaLoja(new Date(recemFeito.janela.inicio)).data, agora)}, ${hora(new Date(recemFeito.janela.inicio))}`
                  : null
              }
            />
            <ConviteParaInstalar
              slug={slug}
              nomeDaLoja={loja.nome}
              paleta={paleta}
              corDaMarca={loja.corDaMarca}
              corDeAcao={loja.corDeAcao}
            />
          </section>
        )}

        {/* Avisos no celular: oferecidos só com pedido andando, que é quando
            o cliente tem motivo para dizer sim. */}
        {pronto && algumEmAndamento && <ConviteParaAvisos paleta={paleta} cor={loja.corDeAcao} />}

        {/* Pedido é da conta: sem entrar, não há o que mostrar — e mostrar
            os pedidos de quem usou o celular antes seria pior ainda. */}
        {pronto && usuarioId === null && (
          <PorteiraDeLogin
            paleta={paleta}
            corDeAcao={loja.corDeAcao}
            textoDoBotao="Entrar para ver"
            resumo="Seus pedidos ficam guardados na sua conta."
          />
        )}

        {pronto && usuarioId !== null && pedidos.length === 0 && (
          <p className="px-4 py-16 text-center text-sm" style={{ color: paleta.suave }}>
            Você ainda não pediu nada nesta loja.
          </p>
        )}

        {pedidos.map((pedido) => {
          const andamento = pronto ? andamentoDe(pedido) : null;
          return (
            <article
              key={pedido.numero}
              className="border-b px-4 py-4"
              style={{ borderColor: paleta.linha }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">Pedido #{pedido.numero}</span>
                <span className="text-sm font-semibold">{moeda(pedido.total)}</span>
              </div>

              {andamento && (
                <Andamento
                  andamento={andamento}
                  agora={agora}
                  paleta={paleta}
                  cor={loja.corDeAcao}
                />
              )}

              {!andamento && instante !== 0 && (
                <p
                  className="mt-1 flex items-center gap-1.5 text-sm"
                  style={{ color: paleta.suave }}
                >
                  <Clock className="size-4 shrink-0" aria-hidden="true" />
                  {previsaoSemAcompanhamento(pedido)}
                </p>
              )}

              <ul className="mt-3 space-y-1 text-sm">
                {pedido.itens.map((item, indice) => (
                  <li key={`${pedido.numero}-${indice}`} className="flex justify-between gap-3">
                    <span>
                      {item.quantidade}× {item.nome}
                      {item.tamanho && ` · ${item.tamanho}`}
                      {item.escolhas.length > 0 && (
                        <span className="block text-xs" style={{ color: paleta.suave }}>
                          {item.escolhas.join(', ')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0" style={{ color: paleta.suave }}>
                      {moeda(item.unitario * item.quantidade)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 space-y-1 text-xs" style={{ color: paleta.suave }}>
                {/* Retirada não tem endereço de entrega — o formulário nem o
                    pergunta. O que o cliente precisa aqui é onde buscar. */}
                {pedido.retirarNaLoja ? (
                  <p className="flex items-start gap-1.5">
                    <Store className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Retirada na loja · {enderecoDeRetirada.rua}, {enderecoDeRetirada.numero}
                      {operacao.retirada.instrucoes && (
                        <span className="block">{operacao.retirada.instrucoes}</span>
                      )}
                    </span>
                  </p>
                ) : (
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {pedido.entrega.rua}, {pedido.entrega.numero}
                      {pedido.entrega.complemento && ` — ${pedido.entrega.complemento}`}
                      {pedido.entrega.referencia && (
                        <span className="block">{pedido.entrega.referencia}</span>
                      )}
                    </span>
                  </p>
                )}
                <p>
                  {pedido.pagamento}
                  {pedido.trocoPara !== null && ` · troco para ${moeda(pedido.trocoPara)}`}
                </p>
              </div>
            </article>
          );
        })}

        {/* O limite do armazenamento no aparelho, dito onde ele importa. */}
        {pronto && pedidos.length > 0 && (
          <p className="px-4 py-4 text-xs" style={{ color: paleta.suave }}>
            Esta lista está na sua conta, mas ainda guardada neste navegador: trocar de celular ou
            limpar os dados do site apaga o histórico daqui. O pedido em si continua com a loja.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Onde o pedido está: a etapa por extenso, a régua do caminho e a previsão.
 *
 * A régua tem uma marca por etapa do caminho DAQUELE pedido — cinco na
 * retirada, seis na entrega —, para "falta pouco" ser visível sem ler nada.
 */
function Andamento({
  andamento,
  agora,
  paleta,
  cor,
}: {
  andamento: VendaDaLoja;
  agora: Date;
  paleta: Paleta;
  cor: string;
}) {
  const caminho = caminhoDoPedido(andamento.modalidade);
  const atual = caminho.indexOf(andamento.etapa);
  const cancelado = andamento.etapa === 'CANCELADO';

  return (
    <div className="mt-2 space-y-2">
      <p
        role="status"
        className="text-sm font-semibold"
        style={{
          color: cancelado
            ? COR_DO_CANCELAMENTO
            : andamento.etapa === 'ENTREGUE'
              ? paleta.texto
              : cor,
        }}
      >
        {etapaParaOCliente(andamento.etapa, andamento.modalidade)}
      </p>

      {!cancelado && (
        <div className="flex gap-1" aria-hidden="true">
          {caminho.map((etapa, indice) => (
            <span
              key={etapa}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ backgroundColor: indice <= atual ? cor : paleta.linha }}
            />
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-sm" style={{ color: paleta.suave }}>
        <Clock className="size-4 shrink-0" aria-hidden="true" />
        {previsaoParaOCliente(andamento, agora)}
      </p>
    </div>
  );
}

/**
 * O pedido de permissão para avisar, dito em termos do pedido — e só depois de
 * um toque. Pedir sozinho, ao abrir a página, é o jeito certo de ouvir "não"
 * e nunca mais poder perguntar.
 */
function ConviteParaAvisos({ paleta, cor }: { paleta: Paleta; cor: string }) {
  const [permissao, setPermissao] = useState<PermissaoDeNotificacao>(permissaoDeNotificacao);

  if (permissao === 'granted') {
    return (
      <p
        className="flex items-center gap-2 border-b px-4 py-3 text-xs"
        style={{ borderColor: paleta.linha, color: paleta.suave }}
      >
        <BellRing className="size-4 shrink-0" aria-hidden="true" />
        Você recebe um aviso neste aparelho a cada passo do pedido.
      </p>
    );
  }

  if (permissao !== 'default') return null;

  return (
    <div className="border-b px-4 py-3" style={{ borderColor: paleta.linha }}>
      <button
        type="button"
        onClick={async () => setPermissao(await pedirPermissaoDeNotificacao())}
        className="flex w-full items-center gap-3 text-left text-sm"
      >
        <Bell className="size-5 shrink-0" style={{ color: cor }} aria-hidden="true" />
        <span>
          <span className="block font-medium">Avisar quando o pedido andar</span>
          <span className="block text-xs" style={{ color: paleta.suave }}>
            Aceito, saiu para entrega, entregue — sem precisar ficar com esta página aberta na
            frente.
          </span>
        </span>
      </button>
    </div>
  );
}
