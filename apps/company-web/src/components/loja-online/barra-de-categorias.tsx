'use client';

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { CURVA_FOLHA, DURACAO } from './movimento';
import { textoSobre, type Paleta } from './paleta';

/**
 * A barra de categorias grudada no topo, com um indicador que acompanha onde o
 * cliente está no cardápio.
 *
 * É a "transição entre categorias" sem trocar o cardápio por abas: a página
 * continua uma rolagem só — que é como se lê um cardápio —, e o que se move é
 * o indicador, deslizando de uma categoria para a outra conforme a lista passa.
 * Abas esconderiam os outros produtos e obrigariam um toque para cada seção.
 *
 * Dois comportamentos ligados à rolagem, e só dois:
 *
 * - o indicador segue a seção que está no topo;
 * - a barra ganha sombra quando descola do topo, porque aí ela passa a flutuar
 *   sobre produtos, e sem a sombra o texto dela se confunde com o da lista.
 */

/** Altura da faixa, logo abaixo da barra, que decide qual seção está "ativa". */
const FAIXA_ATIVA = '-56px 0px -65% 0px';

/** Tempo máximo esperando a rolagem programada terminar, onde não há `scrollend`. */
const ESPERA_DA_ROLAGEM = 900;

export function BarraDeCategorias({
  secoes,
  paleta,
  corDaMarca,
}: {
  secoes: Array<{ id: string; nome: string }>;
  paleta: Paleta;
  corDaMarca: string;
}) {
  const reduzir = useReducedMotion();
  const [ativa, setAtiva] = useState<string | null>(secoes[0]?.id ?? null);
  const [elevada, setElevada] = useState(false);

  const barra = useRef<HTMLElement>(null);
  const indicador = useRef<HTMLSpanElement>(null);
  const sentinela = useRef<HTMLDivElement>(null);
  const chips = useRef(new Map<string, HTMLAnchorElement>());
  const posicionado = useRef(false);

  /*
   * Enquanto a página rola até a categoria tocada, o observador veria cada seção
   * do caminho passar pela faixa e moveria o indicador por todas elas — de Açaí
   * a Bebidas, piscando em Lanches e Sorvetes. A rolagem programada o silencia
   * até terminar.
   */
  const rolandoAte = useRef<string | null>(null);

  // Qual seção está no topo, conforme a lista rola.
  useEffect(() => {
    const visiveis = new Set<string>();

    /*
     * Uma decisão só, chamada pelo observador e pela rolagem, para os dois não
     * disputarem o indicador no mesmo quadro.
     *
     * No fim da página, a última seção vence. Sem essa regra ela nunca ficaria
     * ativa quando for curta — um "Bebidas" com dois itens não chega à faixa do
     * topo, porque não sobra página para rolar até lá.
     */
    function decidir() {
      if (rolandoAte.current) return;
      const rolou = window.scrollY > 0;
      const noFim =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      // A primeira na ordem do cardápio, e não a primeira que o observador
      // listou — ele devolve na ordem em que as mudanças aconteceram.
      const escolhida =
        rolou && noFim ? secoes[secoes.length - 1] : secoes.find((secao) => visiveis.has(secao.id));
      if (escolhida) setAtiva(escolhida.id);
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const id = entrada.target.id.replace('secao-', '');
          if (entrada.isIntersecting) visiveis.add(id);
          else visiveis.delete(id);
        }
        decidir();
      },
      { rootMargin: FAIXA_ATIVA },
    );
    for (const secao of secoes) {
      const elemento = document.getElementById(`secao-${secao.id}`);
      if (elemento) observador.observe(elemento);
    }

    // O fim da página não muda interseção nenhuma, então o observador não o
    // percebe. A rolagem, sim — limitada a uma decisão por quadro.
    let quadro = 0;
    function aoRolar() {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        decidir();
      });
    }
    window.addEventListener('scroll', aoRolar, { passive: true });

    return () => {
      observador.disconnect();
      window.removeEventListener('scroll', aoRolar);
      cancelAnimationFrame(quadro);
    };
  }, [secoes]);

  // A sombra: aparece quando a sentinela, logo acima da barra, sai da tela.
  useEffect(() => {
    const elemento = sentinela.current;
    if (!elemento) return;
    const observador = new IntersectionObserver(([entrada]) =>
      setElevada(entrada ? !entrada.isIntersecting : false),
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  /*
   * O indicador vai até a categoria ativa, e a barra rola na horizontal para
   * mantê-la à vista — senão, em cardápio com muitas categorias, o indicador
   * deslizaria para fora da tela.
   *
   * Largura e posição medidas no próprio conteúdo da barra, e não na tela: assim
   * o cálculo não depende de quanto a página ou a barra estão roladas.
   */
  useLayoutEffect(() => {
    function posicionar(comAnimacao: boolean) {
      const chip = ativa ? chips.current.get(ativa) : undefined;
      const trilho = barra.current;
      const pilula = indicador.current;
      if (!chip || !trilho || !pilula) return;

      const instantaneo = !comAnimacao || reduzir;
      animate(
        pilula,
        { x: chip.offsetLeft, width: chip.offsetWidth },
        { duration: instantaneo ? 0 : DURACAO.curta, ease: CURVA_FOLHA },
      );

      const alvo = chip.offsetLeft - (trilho.clientWidth - chip.offsetWidth) / 2;
      trilho.scrollTo({ left: alvo, behavior: instantaneo ? 'auto' : 'smooth' });
    }

    // Na primeira vez, sem animação: o indicador nasce no lugar, em vez de
    // deslizar do canto esquerdo quando a página abre.
    posicionar(posicionado.current);
    posicionado.current = true;

    // Fonte que termina de carregar muda a largura das categorias; o indicador
    // acompanha, sem animar.
    const trilho = barra.current;
    if (!trilho) return;
    const observador = new ResizeObserver(() => posicionar(false));
    observador.observe(trilho);
    return () => observador.disconnect();
  }, [ativa, reduzir]);

  function irPara(evento: MouseEvent, id: string) {
    const secao = document.getElementById(`secao-${id}`);
    if (!secao) return;
    evento.preventDefault();

    rolandoAte.current = id;
    setAtiva(id);
    secao.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });

    const liberar = () => {
      rolandoAte.current = null;
    };
    window.addEventListener('scrollend', liberar, { once: true });
    window.setTimeout(liberar, ESPERA_DA_ROLAGEM);
  }

  return (
    <>
      <div ref={sentinela} aria-hidden="true" className="h-px" />
      <nav
        ref={barra}
        aria-label="Categorias"
        className="sticky top-0 z-10 overflow-x-auto border-b px-4 py-2 transition-shadow duration-200"
        style={{
          backgroundColor: paleta.fundo,
          borderColor: paleta.linha,
          boxShadow: elevada ? '0 6px 12px -8px rgb(0 0 0 / 0.28)' : 'none',
        }}
      >
        <div className="relative flex w-max gap-2">
          {/* A pílula que desliza. Fica atrás do texto, e por isso o texto da
              categoria ativa troca de cor — para continuar legível sobre ela. */}
          <span
            ref={indicador}
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: corDaMarca, width: 0 }}
          />
          {secoes.map((secao) => {
            const eAtiva = secao.id === ativa;
            return (
              <a
                key={secao.id}
                ref={(elemento) => {
                  if (elemento) chips.current.set(secao.id, elemento);
                  else chips.current.delete(secao.id);
                }}
                href={`#secao-${secao.id}`}
                onClick={(evento) => irPara(evento, secao.id)}
                aria-current={eAtiva ? 'true' : undefined}
                className="relative rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-150"
                style={{
                  borderColor: eAtiva ? 'transparent' : paleta.linha,
                  // Só a cor muda, e não o peso da fonte: negrito alarga a
                  // palavra e empurraria as categorias vizinhas a cada troca.
                  color: eAtiva ? textoSobre(corDaMarca) : paleta.texto,
                }}
              >
                {secao.nome}
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}
