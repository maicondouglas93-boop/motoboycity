'use client';

import { Bike, Check, Store, X } from 'lucide-react';

/**
 * O radar de despacho — a tela de espera enquanto a busca acontece.
 *
 * ## Por que radar, e não um spinner
 *
 * Entre criar o pedido e um entregador aceitar passam segundos ou minutos, e é
 * o único momento em que a loja não tem o que fazer além de olhar. Um spinner
 * diz "carregando" — a mesma coisa que ele diz num salvamento de 200ms. Aqui a
 * espera tem forma: o pulso sai da loja, varre a praça e acende os entregadores
 * que ele alcança. A pessoa entende o que o sistema está fazendo por ela.
 *
 * ## A cor não é decoração
 *
 * O padrão da marca reserva o âmbar para movimento — âmbar na tela significa
 * "tem motoboy na rua com isso" (ver `globals.css`). Enquanto procura, ainda
 * não há ninguém na rua: o radar é o azul-petróleo da estrutura. No instante do
 * aceite ele vira âmbar. A virada de cor É o aviso, antes de qualquer texto.
 *
 * ## Por que CSS puro, e não GSAP/Three.js
 *
 * Tudo aqui é `transform` e `opacity`, que o navegador anima na GPU sem passar
 * pelo layout. Uma biblioteca de animação não deixaria isto mais suave — só
 * mais pesado, num painel que roda em computador de balcão de loja. Detalhe que
 * biblioteca nenhuma daria de graça: cada ponto acende no instante em que a
 * varredura passa por cima dele, porque o atraso da animação do ponto é o mesmo
 * ângulo dele dividido pela volta completa. É isso que faz parecer um radar de
 * verdade, e não um monte de pisca-pisca fora de compasso.
 */
export type DispatchRadarState = 'searching' | 'found' | 'ended';

/** Volta completa da varredura. Também é o ciclo dos pulsos e dos pontos. */
const VOLTA_SEGUNDOS = 3.2;

/**
 * Os entregadores da praça. Ângulo em graus (0 = topo, sentido horário) e raio
 * em porcentagem do meio da placa até a borda.
 *
 * Posições fixas, e não aleatórias: sorteadas a cada render, elas mudariam a
 * cada atualização da lista de pedidos e a cena piscaria inteira. Fixas, o
 * radar fica parado e só o movimento se mexe.
 */
const PONTOS = [
  { angulo: 38, raio: 74, tamanho: 7 },
  { angulo: 104, raio: 52, tamanho: 5 },
  { angulo: 163, raio: 82, tamanho: 6 },
  { angulo: 228, raio: 62, tamanho: 7 },
  { angulo: 292, raio: 86, tamanho: 5 },
  { angulo: 331, raio: 45, tamanho: 6 },
];

/**
 * Casas decimais fixas, e não o número cru.
 *
 * O React arredonda valor de estilo de um jeito no servidor e de outro no
 * cliente: `26.962510410200785%` virava `26.9625%` de um lado e o número
 * inteiro do outro, e a hidratação acusava divergência na página toda. Cortar
 * a precisão aqui faz os dois lados escreverem exatamente a mesma string.
 */
function arredondar(valor: number): string {
  return valor.toFixed(4);
}

function posicaoDoPonto(angulo: number, raio: number) {
  // -90 para o 0° apontar para cima, junto com o começo da varredura.
  const radianos = ((angulo - 90) * Math.PI) / 180;
  return {
    left: `${arredondar(50 + Math.cos(radianos) * (raio / 2))}%`,
    top: `${arredondar(50 + Math.sin(radianos) * (raio / 2))}%`,
  };
}

export function DispatchRadar({
  state,
  label,
}: {
  state: DispatchRadarState;
  /** Texto sob o radar. Vem de fora porque só quem chama sabe o que contar. */
  label?: string;
}) {
  const searching = state === 'searching';

  return (
    <div className="flex flex-col items-center gap-3">
      <style>{RADAR_CSS}</style>

      <div
        className="mbc-radar"
        data-state={state}
        role="img"
        aria-label={
          searching
            ? 'Procurando um entregador disponível'
            : state === 'found'
              ? 'Entregador encontrado'
              : 'Busca encerrada'
        }
      >
        {/* A praça: anéis de distância e duas vias cruzando. */}
        <span className="mbc-radar__plate" aria-hidden="true" />
        <span className="mbc-radar__ring" style={{ '--r': '38%' } as React.CSSProperties} />
        <span className="mbc-radar__ring" style={{ '--r': '64%' } as React.CSSProperties} />
        <span className="mbc-radar__ring" style={{ '--r': '92%' } as React.CSSProperties} />
        <span className="mbc-radar__street" aria-hidden="true" />
        <span className="mbc-radar__street mbc-radar__street--cross" aria-hidden="true" />

        {/* A varredura e os pulsos só existem enquanto procura. */}
        {searching && (
          <>
            <span className="mbc-radar__sweep" aria-hidden="true" />
            {[0, 1, 2].map((indice) => (
              <span
                key={indice}
                className="mbc-radar__pulse"
                style={
                  {
                    animationDelay: `${arredondar((indice * VOLTA_SEGUNDOS) / 3)}s`,
                  } as React.CSSProperties
                }
                aria-hidden="true"
              />
            ))}
          </>
        )}

        {PONTOS.map((ponto) => (
          <span
            key={ponto.angulo}
            className="mbc-radar__blip"
            aria-hidden="true"
            style={
              {
                ...posicaoDoPonto(ponto.angulo, ponto.raio),
                '--size': `${ponto.tamanho}px`,
                // O ponto acende quando a varredura chega nele.
                animationDelay: `${arredondar((ponto.angulo / 360) * VOLTA_SEGUNDOS)}s`,
              } as React.CSSProperties
            }
          />
        ))}

        {/* O centro é a loja: é de lá que o pedido sai. */}
        <span className="mbc-radar__core" aria-hidden="true">
          {state === 'found' ? (
            <Bike className="mbc-radar__icon" strokeWidth={2.2} />
          ) : state === 'ended' ? (
            <X className="mbc-radar__icon" strokeWidth={2.2} />
          ) : (
            <Store className="mbc-radar__icon" strokeWidth={2.2} />
          )}
        </span>

        {state === 'found' && (
          <span className="mbc-radar__stamp" aria-hidden="true">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        )}
      </div>

      {label && (
        <p
          className="max-w-[22rem] text-center text-sm font-medium text-foreground"
          role="status"
          aria-live="polite"
        >
          {label}
        </p>
      )}
    </div>
  );
}

/**
 * O CSS viaja junto com o componente.
 *
 * Poderia estar no `globals.css`, mas aí uma cópia da animação ficaria em cada
 * painel e a outra metade dela (o React) em outro lugar — e a primeira mudança
 * feita só de um lado deixaria os dois painéis diferentes sem ninguém perceber.
 * Um arquivo só é um arquivo só para copiar.
 *
 * `--mbc-radar-ink` resolve a cor de estrutura de cada painel: `--portal` no da
 * empresa, `--admin` no da administração. Como cada app define apenas a sua, a
 * cascata de `var()` escolhe sozinha a que existe ali.
 */
const RADAR_CSS = `
/*
  Registrar a propriedade e o que torna a virada de cor uma TRANSICAO e nao um
  corte seco: custom property nao registrada muda em degrau, e tudo que deriva
  dela pularia junto no instante do aceite.
*/
@property --mbc-radar-color {
  syntax: '<color>';
  inherits: true;
  initial-value: #0f6b70;
}

.mbc-radar {
  --mbc-radar-ink: var(--portal, var(--admin, #0f6b70));
  --mbc-radar-face: var(--portal-deep, var(--admin-deep, #0a3540));
  --mbc-radar-live: var(--colete, #fda02e);
  --mbc-radar-color: var(--mbc-radar-ink);
  /*
    Sobre placa escura, misturar o acento com \`transparent\` so baixa a opacidade
    e a linha some. O que acende e o acento puxado para o branco — e e ele que
    desenha aneis, vias, pulso e pontos.
  */
  --mbc-radar-glow: color-mix(in oklab, var(--mbc-radar-color) 46%, #fff);
  position: relative;
  width: min(14.5rem, 62vw);
  aspect-ratio: 1;
  border-radius: 9999px;
  isolation: isolate;
  transition: --mbc-radar-color 700ms ease;
}
.mbc-radar[data-state='found'] { --mbc-radar-color: var(--mbc-radar-live); }
.mbc-radar[data-state='ended'] { --mbc-radar-color: #7c8b93; }

/*
  A placa e escura de proposito. Num fundo claro o pulso de teal sumia — e um
  radar que mal se ve nao cumpre o papel de ocupar a espera. Escuro, a cena
  passa a ler como instrumento, e o brilho tem contra o que brilhar.
*/
.mbc-radar__plate {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background:
    radial-gradient(
      circle at 50% 42%,
      color-mix(in oklab, var(--mbc-radar-face) 84%, var(--mbc-radar-color)) 0%,
      var(--mbc-radar-face) 58%,
      color-mix(in oklab, var(--mbc-radar-face) 88%, #000) 100%
    );
  box-shadow:
    inset 0 1px 0 color-mix(in oklab, #fff 12%, transparent),
    inset 0 0 44px color-mix(in oklab, #000 45%, transparent),
    0 0 0 1px color-mix(in oklab, var(--mbc-radar-color) 28%, transparent),
    0 18px 40px -22px color-mix(in oklab, var(--mbc-radar-face) 90%, transparent);
  transition: background 700ms ease, box-shadow 700ms ease;
}

.mbc-radar__ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--r);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 9999px;
  border: 1px solid color-mix(in oklab, var(--mbc-radar-glow) 26%, transparent);
  transition: border-color 700ms ease;
}

.mbc-radar__street {
  position: absolute;
  top: 50%;
  left: 6%;
  right: 6%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in oklab, var(--mbc-radar-glow) 26%, transparent) 24%,
    color-mix(in oklab, var(--mbc-radar-glow) 26%, transparent) 76%,
    transparent
  );
  transform: rotate(-24deg);
}
.mbc-radar__street--cross { transform: rotate(58deg); }

/* A varredura: um leque de luz girando sobre a placa. */
.mbc-radar__sweep {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: conic-gradient(
    from 0deg,
    color-mix(in oklab, var(--mbc-radar-glow) 55%, transparent) 0deg,
    color-mix(in oklab, var(--mbc-radar-glow) 26%, transparent) 20deg,
    color-mix(in oklab, var(--mbc-radar-glow) 8%, transparent) 48deg,
    transparent 78deg,
    transparent 360deg
  );
  /* Sem o furo do meio, a varredura vira um disco cheio e some o efeito. */
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent 14%, #000 32%, #000 99%, transparent 100%);
  mask: radial-gradient(circle at 50% 50%, transparent 14%, #000 32%, #000 99%, transparent 100%);
  animation: mbc-radar-sweep ${VOLTA_SEGUNDOS}s linear infinite;
}

/* O pulso que sai da loja e vai ate a borda. */
.mbc-radar__pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 9999px;
  border: 1.5px solid color-mix(in oklab, var(--mbc-radar-glow) 58%, transparent);
  transform: translate(-50%, -50%) scale(0.2);
  opacity: 0;
  animation: mbc-radar-pulse ${VOLTA_SEGUNDOS}s cubic-bezier(0.25, 0.8, 0.4, 1) infinite;
}

.mbc-radar__blip {
  position: absolute;
  width: var(--size);
  aspect-ratio: 1;
  margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2);
  border-radius: 9999px;
  background: var(--mbc-radar-glow);
  opacity: 0.42;
  transition: background 700ms ease;
}
.mbc-radar[data-state='searching'] .mbc-radar__blip {
  animation: mbc-radar-blip ${VOLTA_SEGUNDOS}s ease-out infinite;
}

.mbc-radar__core {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 25%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 32%;
  color: #fff;
  background: linear-gradient(
    145deg,
    color-mix(in oklab, var(--mbc-radar-color) 62%, #fff),
    var(--mbc-radar-color)
  );
  box-shadow:
    0 0 0 5px color-mix(in oklab, var(--mbc-radar-glow) 24%, transparent),
    0 0 30px color-mix(in oklab, var(--mbc-radar-glow) 60%, transparent),
    0 8px 18px -8px #000;
  transition: background 700ms ease, box-shadow 700ms ease;
}
.mbc-radar[data-state='searching'] .mbc-radar__core {
  animation: mbc-radar-breathe 2.4s ease-in-out infinite;
}
.mbc-radar[data-state='found'] .mbc-radar__core {
  animation: mbc-radar-land 700ms cubic-bezier(0.2, 1.6, 0.4, 1) 1;
}
.mbc-radar__icon { width: 46%; height: 46%; }

.mbc-radar__stamp {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  margin: 1.5rem 0 0 1.5rem;
  border-radius: 9999px;
  color: #fff;
  background: var(--placa, #0b6e4f);
  box-shadow: 0 0 0 3px var(--mbc-radar-face, #0a3540);
  animation: mbc-radar-stamp 420ms cubic-bezier(0.2, 1.5, 0.4, 1) 260ms both;
}

@keyframes mbc-radar-sweep {
  to { transform: rotate(360deg); }
}
@keyframes mbc-radar-pulse {
  0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
  14%  { opacity: 0.75; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}
@keyframes mbc-radar-blip {
  0%, 88% { opacity: 0.42; transform: scale(1); box-shadow: none; }
  4%      { opacity: 1;    transform: scale(1.9);
            box-shadow: 0 0 12px color-mix(in oklab, var(--mbc-radar-glow) 85%, transparent); }
  30%     { opacity: 0.55; transform: scale(1); box-shadow: none; }
}
@keyframes mbc-radar-breathe {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50%      { transform: translate(-50%, -50%) scale(1.06); }
}
@keyframes mbc-radar-land {
  0%   { transform: translate(-50%, -50%) scale(0.8); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
@keyframes mbc-radar-stamp {
  from { transform: scale(0.4); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

/*
  Quem pediu menos movimento no sistema operacional costuma ter um motivo de
  saude — enjoo, vertigem, sensibilidade vestibular. A cena continua inteira e
  legivel; o que para e o giro e a pulsacao.
*/
@media (prefers-reduced-motion: reduce) {
  .mbc-radar { transition: none; }
  .mbc-radar__sweep,
  .mbc-radar__pulse,
  .mbc-radar__blip,
  .mbc-radar__core,
  .mbc-radar__stamp {
    animation: none !important;
  }
  .mbc-radar__pulse { opacity: 0.35; transform: translate(-50%, -50%) scale(0.66); }
  .mbc-radar__blip { opacity: 0.6; }
}
`;
