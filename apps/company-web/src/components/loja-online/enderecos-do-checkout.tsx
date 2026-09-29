'use client';

import { useState } from 'react';
import type { EnderecoDaEntrega } from '@/lib/loja-mock';
import estilos from '@/components/loja-online/loja.module.css';
import { Campo, OpcaoDaLista } from '@/components/loja-online/campos-do-checkout';
import { MAX_ENDERECOS, type EnderecoSalvo } from '@/components/loja-online/armazenamento';
import type { Paleta } from '@/components/loja-online/paleta';

/**
 * A escolha do endereço no checkout: os que a conta já guardou, mais "Outro
 * endereço". Quem tem um só vê um cartão com o endereço dele em vez do
 * formulário inteiro; quem tem vários escolhe para onde vai este pedido — casa,
 * trabalho, a casa da mãe.
 *
 * O formulário continua sendo o de sempre (em `sacola.tsx`): escolher um
 * endereço da lista só o preenche, e quem quiser mexer toca em "Editar".
 */

/** "Rua A, 10 — Casa 2 · Centro": o que basta para reconhecer o endereço. */
export function resumoDoEndereco(endereco: EnderecoDaEntrega): string {
  const rua = [endereco.rua, endereco.numero].filter(Boolean).join(', ');
  const comComplemento = endereco.complemento ? `${rua} — ${endereco.complemento}` : rua;
  return [comComplemento, endereco.bairro].filter(Boolean).join(' · ');
}

const BOTAO_DE_TEXTO = `${estilos['foco']} rounded-md px-1 py-1 text-sm font-medium underline underline-offset-2`;

export function EnderecosSalvos({
  enderecos,
  escolhido,
  bairrosDaLoja,
  aoEscolher,
  aoEditar,
  aoApagar,
  paleta,
}: {
  enderecos: EnderecoSalvo[];
  /** O id do marcado; `null` é "Outro endereço". */
  escolhido: string | null;
  /** Os bairros que a loja atende: o endereço fora deles não serve. */
  bairrosDaLoja: string[];
  aoEscolher: (id: string | null) => void;
  aoEditar: () => void;
  aoApagar: (id: string) => void;
  paleta: Paleta;
}) {
  // O apagar é em dois toques: apagar sem querer um endereço digitado à mão é
  // uma perda que só se conserta redigitando.
  const [confirmando, setConfirmando] = useState<string | null>(null);

  return (
    <div role="radiogroup" aria-label="Entregar em">
      {enderecos.map((salvo, indice) => {
        const marcado = salvo.id === escolhido;
        const foraDaArea = !bairrosDaLoja.includes(salvo.endereco.bairro);
        return (
          <OpcaoDaLista
            key={salvo.id}
            nome="endereco-salvo"
            titulo={salvo.apelido}
            detalhe={`${resumoDoEndereco(salvo.endereco)}${foraDaArea ? ' · bairro fora da área da loja' : ''}`}
            marcada={marcado}
            aoMarcar={() => {
              setConfirmando(null);
              aoEscolher(salvo.id);
            }}
            primeira={indice === 0}
            paleta={paleta}
          >
            {marcado && (
              <div className="flex items-center gap-3 pb-3 pl-7">
                <button type="button" onClick={aoEditar} className={BOTAO_DE_TEXTO}>
                  Editar
                </button>
                {confirmando === salvo.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmando(null);
                        aoApagar(salvo.id);
                      }}
                      className={BOTAO_DE_TEXTO}
                      style={{ color: paleta.erro }}
                    >
                      Apagar mesmo
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(null)}
                      className={BOTAO_DE_TEXTO}
                    >
                      Manter
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmando(salvo.id)}
                    className={BOTAO_DE_TEXTO}
                  >
                    Apagar
                  </button>
                )}
              </div>
            )}
          </OpcaoDaLista>
        );
      })}
      <OpcaoDaLista
        nome="endereco-salvo"
        titulo="Outro endereço"
        detalhe="Digite um endereço novo."
        marcada={escolhido === null}
        aoMarcar={() => {
          setConfirmando(null);
          aoEscolher(null);
        }}
        primeira={false}
        paleta={paleta}
      />
    </div>
  );
}

/** Os apelidos de sempre, a um toque: quem digita pouco no celular agradece. */
const SUGESTOES = ['Casa', 'Trabalho'] as const;

/**
 * O nome do endereço e, quando ele é novo, se vale guardá-lo. Aparece no fim do
 * formulário, onde o cliente já digitou tudo e só falta dizer o que fazer com
 * aquilo.
 */
export function NomeDoEndereco({
  novo,
  apelido,
  aoMudarApelido,
  salvar,
  aoMudarSalvar,
  quantosGuardados,
  paleta,
}: {
  /** `true`: endereço digitado agora. `false`: um da lista, em edição. */
  novo: boolean;
  apelido: string;
  aoMudarApelido: (valor: string) => void;
  salvar: boolean;
  aoMudarSalvar: (valor: boolean) => void;
  quantosGuardados: number;
  paleta: Paleta;
}) {
  const cheio = novo && quantosGuardados >= MAX_ENDERECOS;
  const guardando = !novo || salvar;

  return (
    <div className="space-y-3 border-t pt-4" style={{ borderColor: paleta.linha }}>
      {novo &&
        (cheio ? (
          <p className="text-sm text-pretty" style={{ color: paleta.suave }}>
            Você já guardou {MAX_ENDERECOS} endereços. Apague um para guardar este.
          </p>
        ) : (
          <label className={`${estilos['opcao']} flex cursor-pointer items-start gap-3`}>
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              style={{ accentColor: paleta.texto }}
              checked={salvar}
              onChange={(evento) => aoMudarSalvar(evento.target.checked)}
            />
            <span className="text-base">Guardar este endereço para os próximos pedidos</span>
          </label>
        ))}

      {guardando && !cheio && (
        <div>
          <Campo
            id="apelido"
            rotulo="Nome do endereço"
            valor={apelido}
            aoMudar={(valor) => aoMudarApelido(valor.slice(0, 20))}
            paleta={paleta}
            maxLength={20}
            dica="Como você reconhece este endereço na lista."
          />
          <div className="mt-2 flex gap-2">
            {SUGESTOES.map((sugestao) => (
              <button
                key={sugestao}
                type="button"
                onClick={() => aoMudarApelido(sugestao)}
                aria-pressed={apelido === sugestao}
                className={`${estilos['foco']} rounded-full border px-3 py-1.5 text-sm`}
                style={{
                  borderColor: apelido === sugestao ? paleta.texto : paleta.contorno,
                  backgroundColor: apelido === sugestao ? paleta.superficie : paleta.fundo,
                  fontWeight: apelido === sugestao ? 600 : 400,
                }}
              >
                {sugestao}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
