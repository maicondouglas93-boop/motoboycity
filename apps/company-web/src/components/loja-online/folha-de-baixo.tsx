'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { m, useDragControls, type PanInfo } from 'motion/react';
import { CURVA_FOLHA, CURVA_SAIDA, DURACAO } from './movimento';
import type { Paleta } from './paleta';

/**
 * A folha que sobe de baixo — a do produto e a da sacola usam esta mesma.
 *
 * Uma implementação só porque duas folhas com animações próprias acabariam
 * diferentes: uma subindo mais rápido, outra fechando de outro jeito. Para o
 * cliente, as duas são a mesma coisa, e têm que se comportar igual.
 *
 * Quem usa precisa envolver em `<AnimatePresence>`, senão a saída não anima: o
 * React desmonta na hora e a folha some em vez de descer.
 *
 * **Arrastar para baixo fecha**, porque é o gesto que todo mundo tenta num
 * celular. Mas só pela alça e pelo cabeçalho: se o corpo inteiro fosse
 * arrastável, rolar a lista de adicionais puxaria a folha junto.
 */

/** Quanto arrastar, ou com que velocidade soltar, para a folha fechar. */
const LIMIAR_DE_DISTANCIA = 120;
const LIMIAR_DE_VELOCIDADE = 600;

export function FolhaDeBaixo({
  rotulo,
  paleta,
  onFechar,
  cabecalho,
  rodape,
  children,
}: {
  /** Nome do diálogo para leitor de tela. */
  rotulo: string;
  paleta: Paleta;
  onFechar: () => void;
  cabecalho: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const controles = useDragControls();
  const painel = useRef<HTMLDivElement>(null);

  // Esc fecha, como em qualquer diálogo.
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onFechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  /*
   * O cardápio por trás não rola enquanto a folha está aberta. Sem isso, o dedo
   * que chega ao fim da lista de adicionais continua rolando a página de baixo,
   * e ao fechar a folha o cliente está em outra categoria.
   */
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  // O foco entra na folha ao abrir e volta para onde estava ao fechar — sem
  // isso, quem navega pelo teclado fica perdido atrás do fundo escurecido.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    painel.current?.focus({ preventScroll: true });
    return () => antes?.focus?.({ preventScroll: true });
  }, []);

  function aoSoltar(_: unknown, info: PanInfo) {
    if (info.offset.y > LIMIAR_DE_DISTANCIA || info.velocity.y > LIMIAR_DE_VELOCIDADE) {
      onFechar();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <m.button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onFechar}
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: DURACAO.curta } }}
        exit={{ opacity: 0, transition: { duration: DURACAO.curta } }}
      />

      <m.div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        tabIndex={-1}
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl outline-none"
        style={{ backgroundColor: paleta.fundo, color: paleta.texto }}
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: { duration: DURACAO.folha, ease: CURVA_FOLHA } }}
        exit={{ y: '100%', transition: { duration: DURACAO.curta, ease: CURVA_SAIDA } }}
        drag="y"
        dragListener={false}
        dragControls={controles}
        dragConstraints={{ top: 0, bottom: 0 }}
        // Para cima não cede nada; para baixo cede, para o dedo sentir que
        // está puxando algo que vai sair.
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={aoSoltar}
      >
        {/* Alça e cabeçalho são a área de arraste. `touch-none` impede o
            navegador de tratar o gesto como rolagem da página. */}
        <div className="touch-none" onPointerDown={(evento) => controles.start(evento)}>
          <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: paleta.linha }} />
          </div>
          {cabecalho}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {rodape}
      </m.div>
    </div>
  );
}
