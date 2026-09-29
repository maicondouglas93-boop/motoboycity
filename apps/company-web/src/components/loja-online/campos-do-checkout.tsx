import type { CSSProperties, ReactNode } from 'react';
import estilos from '@/components/loja-online/loja.module.css';
import type { Paleta } from '@/components/loja-online/paleta';

/**
 * As peças do formulário do checkout.
 *
 * Moram fora de `sacola.tsx` para o formulário ter UMA regra de aparência:
 * campo de 16px (abaixo disso o Safari do iPhone amplia a tela ao focar),
 * contorno com contraste, erro escrito embaixo do campo e anel de foco na cor
 * do texto da loja. As cores vêm da paleta da loja, e não dos tokens do painel.
 */

function estiloDoControle(paleta: Paleta, invalido: boolean): CSSProperties {
  return {
    backgroundColor: paleta.fundo,
    color: paleta.texto,
    borderColor: invalido ? paleta.erro : paleta.contorno,
  };
}

/** Um bloco do formulário: título e conteúdo, separados dos outros por uma linha. */
export function Secao({
  titulo,
  paleta,
  children,
}: {
  titulo: string;
  paleta: Paleta;
  children: ReactNode;
}) {
  return (
    <section className="border-t px-4 py-5" style={{ borderColor: paleta.linha }}>
      <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function descricaoDoCampo(id: string, dica?: string, erro?: string): string | undefined {
  const ids = [dica ? `${id}-dica` : null, erro ? `${id}-erro` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function Ajuda({
  id,
  dica,
  erro,
  paleta,
}: {
  id: string;
  dica?: string;
  erro?: string;
  paleta: Paleta;
}) {
  // O erro vem colado no campo, antes da ajuda: é o que a pessoa precisa ler agora.
  return (
    <>
      {erro && (
        <p
          id={`${id}-erro`}
          className="mt-1.5 text-sm font-medium text-pretty"
          style={{ color: paleta.erro }}
        >
          {erro}
        </p>
      )}
      {dica && (
        <p id={`${id}-dica`} className="mt-1.5 text-xs text-pretty" style={{ color: paleta.suave }}>
          {dica}
        </p>
      )}
    </>
  );
}

export function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  paleta,
  dica,
  erro,
  inputMode,
  autoComplete,
  maxLength,
  className,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  paleta: Paleta;
  dica?: string;
  erro?: string;
  inputMode?: 'tel' | 'numeric' | 'decimal';
  autoComplete?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        onChange={(evento) => aoMudar(evento.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricaoDoCampo(id, dica, erro)}
        className={`${estilos['foco']} h-11 w-full rounded-lg border px-3 text-base`}
        style={estiloDoControle(paleta, Boolean(erro))}
      />
      <Ajuda id={id} dica={dica} erro={erro} paleta={paleta} />
    </div>
  );
}

export function CampoDeLista({
  id,
  rotulo,
  valor,
  aoMudar,
  paleta,
  dica,
  erro,
  className,
  children,
}: {
  id: string;
  rotulo: string;
  valor: string | number;
  aoMudar: (valor: string) => void;
  paleta: Paleta;
  dica?: string;
  erro?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricaoDoCampo(id, dica, erro)}
        className={`${estilos['foco']} h-11 w-full rounded-lg border px-3 text-base`}
        style={estiloDoControle(paleta, Boolean(erro))}
      >
        {children}
      </select>
      <Ajuda id={id} dica={dica} erro={erro} paleta={paleta} />
    </div>
  );
}

export function CampoDeTexto({
  id,
  rotulo,
  valor,
  aoMudar,
  paleta,
  placeholder,
  maxLength,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  paleta: Paleta;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <textarea
        id={id}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        rows={2}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`${estilos['foco']} w-full rounded-lg border px-3 py-2 text-base`}
        style={estiloDoControle(paleta, false)}
      />
    </div>
  );
}

/**
 * Duas opções lado a lado — entrega ou retirada, agora ou agendar. Para a
 * escolha binária, isto pede metade da altura de uma lista de rádios, e as duas
 * respostas ficam à vista ao mesmo tempo.
 *
 * O rádio de verdade continua ali, escondido: o teclado, as setas e o leitor de
 * tela funcionam como em qualquer grupo de rádios. A opção marcada ganha o
 * contorno mais forte na cor do texto, e não na da marca: a cor da marca pode
 * ser um amarelo que some no branco.
 */
export function Segmentado<T extends string>({
  nome,
  rotulo,
  valor,
  opcoes,
  aoMudar,
  paleta,
}: {
  nome: string;
  rotulo: string;
  valor: T;
  opcoes: ReadonlyArray<{
    valor: T;
    titulo: string;
    detalhe?: string;
    desabilitada?: boolean;
  }>;
  aoMudar: (valor: T) => void;
  paleta: Paleta;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid grid-cols-2 gap-2">
      {opcoes.map((opcao) => {
        const marcada = opcao.valor === valor;
        return (
          <label
            key={opcao.valor}
            className={`${estilos['opcao']} flex flex-col gap-0.5 rounded-lg border p-3 ${
              opcao.desabilitada ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
            }`}
            style={{
              borderColor: marcada ? paleta.texto : paleta.contorno,
              backgroundColor: marcada ? paleta.superficie : paleta.fundo,
              boxShadow: marcada ? `inset 0 0 0 1px ${paleta.texto}` : undefined,
            }}
          >
            <input
              type="radio"
              name={nome}
              className="sr-only"
              checked={marcada}
              disabled={opcao.desabilitada}
              onChange={() => aoMudar(opcao.valor)}
            />
            <span className="text-base font-semibold">{opcao.titulo}</span>
            {opcao.detalhe && (
              <span className="text-sm text-pretty" style={{ color: paleta.suave }}>
                {opcao.detalhe}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Uma opção de uma lista mais longa, com descrição — as formas de pagamento.
 * O que só faz sentido para ela (o troco do dinheiro, o CPF do Pix) entra como
 * `children`, logo abaixo, quando ela está marcada.
 */
export function OpcaoDaLista({
  nome,
  titulo,
  detalhe,
  marcada,
  aoMarcar,
  primeira,
  paleta,
  children,
}: {
  nome: string;
  titulo: string;
  detalhe: string | null;
  marcada: boolean;
  aoMarcar: () => void;
  primeira: boolean;
  paleta: Paleta;
  children?: ReactNode;
}) {
  return (
    <div className={primeira ? '' : 'border-t'} style={{ borderColor: paleta.linha }}>
      <label className={`${estilos['opcao']} flex cursor-pointer items-start gap-3 py-3`}>
        <input
          type="radio"
          name={nome}
          className="mt-1 size-4 shrink-0"
          style={{ accentColor: paleta.texto }}
          checked={marcada}
          onChange={aoMarcar}
        />
        <span className="min-w-0 flex-1">
          <span className={`block text-base ${marcada ? 'font-semibold' : ''}`}>{titulo}</span>
          {detalhe && (
            <span className="block text-sm text-pretty" style={{ color: paleta.suave }}>
              {detalhe}
            </span>
          )}
        </span>
      </label>
      {children}
    </div>
  );
}
