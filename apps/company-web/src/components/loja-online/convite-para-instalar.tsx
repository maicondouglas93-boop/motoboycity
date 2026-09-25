'use client';

import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { PlusSquare, Share, X } from 'lucide-react';
import { FolhaDeBaixo } from './folha-de-baixo';
import { conviteLiberado, eIos, jaInstalado, pedirInstalacao, usePodeInstalar } from './instalacao';
import { CURVA_ENTRADA, DURACAO } from './movimento';
import { textoSobre, type Paleta } from './paleta';

/**
 * O convite para pôr a loja na tela inicial.
 *
 * Aparece depois do pedido feito, e não na primeira visita: antes da primeira
 * compra o cliente não tem motivo para querer a loja no celular, e o convite
 * seria só mais uma coisa entre ele e o cardápio. Depois do pedido, a pergunta
 * natural é "e da próxima vez?".
 *
 * "Agora não" faz o convite descansar trinta dias. Um convite que volta a cada
 * pedido deixa de ser convite.
 *
 * Só monta no navegador, depois da hidratação — lê o aparelho e o
 * armazenamento local, que o servidor não tem. Quem o usa já está dentro dessa
 * condição.
 */

const chaveDoDescanso = (slug: string) => `loja:${slug}:convite-instalar`;

function lerDescanso(slug: string): number | null {
  try {
    const valor = window.localStorage.getItem(chaveDoDescanso(slug));
    return valor === null ? null : Number(valor);
  } catch {
    return null;
  }
}

function guardarDescanso(slug: string): void {
  try {
    window.localStorage.setItem(chaveDoDescanso(slug), String(Date.now()));
  } catch {
    // Sem armazenamento, o convite volta na próxima vez. Não é grave.
  }
}

export function ConviteParaInstalar({
  slug,
  nomeDaLoja,
  paleta,
  corDaMarca,
  corDeAcao,
}: {
  slug: string;
  nomeDaLoja: string;
  paleta: Paleta;
  corDaMarca: string;
  corDeAcao: string;
}) {
  const podeInstalar = usePodeInstalar();
  // Lidos uma vez, ao montar: o aparelho não muda enquanto a página está aberta.
  const [ios] = useState(eIos);
  const [instalado] = useState(jaInstalado);
  const [liberado, setLiberado] = useState(() => conviteLiberado(lerDescanso(slug), Date.now()));
  const [passos, setPassos] = useState(false);

  const disponivel = !instalado && liberado && (podeInstalar || ios);

  function agoraNao() {
    guardarDescanso(slug);
    setLiberado(false);
  }

  async function instalar() {
    if (ios) {
      setPassos(true);
      return;
    }
    const resultado = await pedirInstalacao();
    // Recusou no diálogo do navegador: vale como "agora não". Aceitou: o
    // convite some porque o navegador deixa de oferecer a instalação.
    if (resultado === 'recusado') agoraNao();
  }

  return (
    <>
      <AnimatePresence>
        {disponivel && (
          <m.div
            key="convite"
            // Entra depois de a confirmação terminar de se desenhar: as duas
            // coisas ao mesmo tempo disputariam o olho, e a confirmação vem antes.
            initial={{ opacity: 0, y: 6 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { delay: 0.6, duration: DURACAO.curta, ease: CURVA_ENTRADA },
            }}
            exit={{ opacity: 0, transition: { duration: DURACAO.instante } }}
            className="mt-4 flex items-center gap-3 rounded-xl border p-3"
            style={{ borderColor: paleta.linha }}
          >
            <div
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-bold"
              style={{ backgroundColor: corDaMarca, color: textoSobre(corDaMarca) }}
              aria-hidden="true"
            >
              {nomeDaLoja.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Ter a {nomeDaLoja} no celular</p>
              <p className="text-xs" style={{ color: paleta.suave }}>
                O próximo pedido fica a um toque, direto da tela inicial.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                onClick={instalar}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
              >
                Instalar
              </button>
              <button
                type="button"
                onClick={agoraNao}
                className="px-1 text-xs"
                style={{ color: paleta.suave }}
              >
                Agora não
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* iPhone: não há botão de instalar possível. O que dá para fazer é
          mostrar os passos, com o mesmo desenho do ícone que a pessoa vai
          procurar na barra do Safari. */}
      <AnimatePresence>
        {passos && (
          <FolhaDeBaixo
            key="passos"
            rotulo="Como instalar no iPhone"
            paleta={paleta}
            onFechar={() => setPassos(false)}
            cabecalho={
              <div
                className="flex items-center justify-between gap-3 border-b px-4 pt-1 pb-3"
                style={{ borderColor: paleta.linha }}
              >
                <h2 className="text-lg font-semibold">Instalar no iPhone</h2>
                <button
                  type="button"
                  onClick={() => setPassos(false)}
                  aria-label="Fechar"
                  className="-mr-1 rounded-full p-2"
                  style={{ color: paleta.suave }}
                >
                  <X className="size-5" />
                </button>
              </div>
            }
          >
            <ol className="space-y-4 px-4 py-5 text-sm">
              <li className="flex items-start gap-3">
                <Numero paleta={paleta}>1</Numero>
                <span>
                  Toque em <strong>Compartilhar</strong>{' '}
                  <Share className="inline size-4 align-text-bottom" aria-hidden="true" /> na barra
                  do Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Numero paleta={paleta}>2</Numero>
                <span>
                  Role e escolha <strong>Adicionar à Tela de Início</strong>{' '}
                  <PlusSquare className="inline size-4 align-text-bottom" aria-hidden="true" />.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Numero paleta={paleta}>3</Numero>
                <span>
                  Toque em <strong>Adicionar</strong>. A {nomeDaLoja} aparece na tela inicial, como
                  um app.
                </span>
              </li>
            </ol>
          </FolhaDeBaixo>
        )}
      </AnimatePresence>
    </>
  );
}

function Numero({ paleta, children }: { paleta: Paleta; children: string }) {
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{ backgroundColor: paleta.superficie }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
