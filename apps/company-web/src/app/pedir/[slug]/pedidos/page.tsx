'use client';

import { Suspense, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, Clock, MapPin } from 'lucide-react';
import { LOJA_DE_EXEMPLO } from '@/lib/loja-mock';
import { moeda, paletaDoTema, textoSobre } from '@/components/loja-online/paleta';
import {
  useHidratado,
  usePedidos,
  type PedidoGuardado,
} from '@/components/loja-online/armazenamento';

/**
 * Onde o cliente responde sozinho a pergunta que ele faria à loja no WhatsApp:
 * "cadê meu pedido?".
 *
 * Não há aba para cá no rodapé de propósito: o link só existe depois do
 * primeiro pedido. Uma aba vazia para todo visitante novo ocuparia a faixa da
 * tela que decide a venda sem dizer nada.
 */
function previsao(pedido: PedidoGuardado): string {
  const feito = new Date(pedido.criadoEm);
  const de = new Date(feito.getTime() + pedido.minutosDePreparo * 60_000);
  const ate = new Date(de.getTime() + 15 * 60_000);
  const hora = (data: Date) =>
    data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${hora(de)} e ${hora(ate)}`;
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
  const pedidos = usePedidos(slug);
  const hidratado = useHidratado();

  const novo = Number(useSearchParams().get('novo')) || null;

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

        {hidratado && pedidos.length === 0 && (
          <p className="px-4 py-16 text-center text-sm" style={{ color: paleta.suave }}>
            Você ainda não pediu nada nesta loja neste aparelho.
          </p>
        )}

        {pedidos.map((pedido) => {
          const recemFeito = pedido.numero === novo;

          return (
            <article
              key={pedido.numero}
              className="border-b px-4 py-4"
              style={{ borderColor: paleta.linha }}
            >
              {recemFeito && (
                <p
                  className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                  style={{ backgroundColor: loja.corDeAcao, color: textoSobre(loja.corDeAcao) }}
                >
                  <Check className="size-4 shrink-0" aria-hidden="true" />
                  Pedido enviado para a loja.
                </p>
              )}

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">Pedido #{pedido.numero}</span>
                <span className="text-sm font-semibold">{moeda(pedido.total)}</span>
              </div>

              <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: paleta.suave }}>
                <Clock className="size-4 shrink-0" aria-hidden="true" />
                Chega entre {previsao(pedido)}
              </p>

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
                <p>
                  {pedido.pagamento}
                  {pedido.trocoPara !== null && ` · troco para ${moeda(pedido.trocoPara)}`}
                </p>
              </div>
            </article>
          );
        })}

        {/* O limite do armazenamento no aparelho, dito onde ele importa. */}
        {hidratado && pedidos.length > 0 && (
          <p className="px-4 py-4 text-xs" style={{ color: paleta.suave }}>
            Esta lista fica guardada neste aparelho e neste navegador. Trocar de celular ou limpar
            os dados do site apaga o histórico — o pedido em si continua com a loja.
          </p>
        )}
      </div>
    </div>
  );
}
