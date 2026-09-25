'use client';

import { useState } from 'react';
import { Clock, Pause, Play, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ajustarAgora, useOperacao } from '@/lib/loja-demo';
import {
  emMinutos,
  hora,
  instanteNaLoja,
  momentoNaLoja,
  proximaAberturaDoHorario,
  rotuloDoDia,
  situacaoDaLoja,
  somarDias,
  type AjusteManual,
  type EstadoManual,
  type SituacaoDaLoja,
} from '@/lib/loja-horario';
import { acertarRelogio, useAgora } from '@/lib/relogio';

/**
 * Aberta, fechada ou pausada — e o botão para mudar isso agora.
 *
 * Fica no alto da área da loja, em todas as telas dela, e não escondido em
 * Configurações: é o controle mais usado numa noite ruim. Acabou o
 * ingrediente, a cozinha encheu, choveu demais para o motoboy — a loja pausa
 * sem mexer no horário e sem precisar lembrar de desfazer depois, porque a
 * pausa e o fechamento vencem sozinhos.
 */

const MINUTO = 60_000;

/** "às 18:00", "amanhã às 11:00", "sexta às 11:00", "12/10 às 11:00". */
function quando(data: Date, agora: Date): string {
  const dia = rotuloDoDia(momentoNaLoja(data).data, agora);
  return dia === 'hoje' ? `às ${hora(data)}` : `${dia} às ${hora(data)}`;
}

/** A frase do painel, que fala com quem opera, e não com o cliente. */
function detalhe(situacao: SituacaoDaLoja, ajuste: AjusteManual | null, agora: Date): string {
  switch (situacao.motivo) {
    case 'PAUSADA':
      return ajuste?.ate
        ? `pedidos voltam ${quando(new Date(ajuste.ate), agora)}`
        : 'até você retomar';
    case 'FECHADA_MANUAL':
      return ajuste?.ate
        ? `volta a abrir ${quando(new Date(ajuste.ate), agora)}`
        : 'até você reabrir';
    case 'ABERTA_MANUAL':
      return situacao.muda ? `aberta por você até ${hora(situacao.muda)}` : 'aberta por você';
    default:
      if (situacao.aberta) {
        const nome = situacao.excecao?.motivo.trim();
        const ate = situacao.muda ? `até ${hora(situacao.muda)}` : '24 horas';
        return nome ? `${ate} · ${nome}` : ate;
      }
      if (situacao.excecao?.tipo === 'FECHADO') {
        const nome = situacao.excecao.motivo.trim() || 'data especial';
        return situacao.muda ? `${nome} · abre ${quando(situacao.muda, agora)}` : nome;
      }
      return situacao.muda ? `abre ${quando(situacao.muda, agora)}` : 'sem horário cadastrado';
  }
}

type Menu = 'pausar' | 'fechar' | 'abrir' | null;

export function ControleDoStatus() {
  const operacao = useOperacao();
  const instante = useAgora();
  const [menu, setMenu] = useState<Menu>(null);
  const [ateAs, setAteAs] = useState('');

  // Antes da hidratação não há hora — e o status depende dela.
  if (instante === 0) return <div className="h-24 rounded-xl border" aria-hidden="true" />;

  const agora = new Date(instante);
  const { funcionamento } = operacao;
  const situacao = situacaoDaLoja(funcionamento, agora);
  const semAjuste = situacaoDaLoja({ ...funcionamento, ajuste: null }, agora);
  const ajuste =
    situacao.motivo === 'PAUSADA' || situacao.motivo.endsWith('MANUAL')
      ? funcionamento.ajuste
      : null;
  const pausada = situacao.motivo === 'PAUSADA';

  /** Grava com a hora acertada agora, para a tela já ver o ajuste começado. */
  function ajustar(estado: EstadoManual, minutos: number | null, ate?: Date | null) {
    const desde = acertarRelogio();
    const fim =
      ate !== undefined ? ate : minutos === null ? null : new Date(desde + minutos * MINUTO);
    ajustarAgora({
      estado,
      desde: new Date(desde).toISOString(),
      ate: fim ? fim.toISOString() : null,
    });
    setMenu(null);
  }

  function voltarAoHorario() {
    acertarRelogio();
    ajustarAgora(null);
    setMenu(null);
  }

  /** "Até HH:MM" de hoje — ou de amanhã, se a hora já passou (abrir até 00:30). */
  function abrirAte() {
    const minutos = emMinutos(ateAs);
    const hoje = momentoNaLoja(agora).data;
    let fim = instanteNaLoja(hoje, minutos);
    if (fim.getTime() <= agora.getTime()) fim = instanteNaLoja(somarDias(hoje, 1), minutos);
    ajustar('ABERTA', null, fim);
  }

  const proxima = situacao.aberta ? proximaAberturaDoHorario(funcionamento, agora) : null;
  const faltam =
    situacao.aberta && situacao.muda
      ? Math.ceil((situacao.muda.getTime() - agora.getTime()) / MINUTO)
      : null;
  const fechando = faltam !== null && faltam <= operacao.notificacoes.minutosAntesDeFechar;

  const cor = situacao.aberta ? 'bg-emerald-500' : pausada ? 'bg-amber-500' : 'bg-red-500';
  const rotulo = situacao.aberta ? 'Aberta' : pausada ? 'Pausada' : 'Fechada';

  return (
    <section aria-label="Status da loja" className="space-y-3 rounded-xl border p-3">
      <div role="status" className="flex items-start gap-2.5">
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${cor}`} aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{rotulo}</span>
          <span className="block text-xs text-muted-foreground">
            {detalhe(situacao, ajuste, agora)}
          </span>
        </span>
      </div>

      {/* Fechando: a hora de decidir se fica mais um pouco, e não depois. */}
      {fechando && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <Clock className="size-3.5 text-amber-700" aria-hidden="true" />
            Fecha em {faltam} min
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() =>
              situacao.muda &&
              ajustar('ABERTA', null, new Date(situacao.muda.getTime() + 60 * MINUTO))
            }
          >
            Ficar aberta mais 1 hora
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {pausada && (
          <Button type="button" size="sm" className="w-full" onClick={voltarAoHorario}>
            <Play className="size-4" /> Retomar pedidos
          </Button>
        )}

        {(situacao.motivo === 'FECHADA_MANUAL' || situacao.motivo === 'ABERTA_MANUAL') && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={voltarAoHorario}
            >
              Voltar ao horário normal
            </Button>
            {/* O que "voltar" vai fazer, dito antes do toque: pode abrir agora,
                ou pode deixar fechada até amanhã. */}
            <p className="text-xs text-muted-foreground">
              {semAjuste.aberta
                ? 'Pelo horário, a loja está aberta agora.'
                : semAjuste.muda
                  ? `Pelo horário, abre ${quando(semAjuste.muda, agora)}.`
                  : 'Pelo horário, a loja não abre.'}
            </p>
          </>
        )}

        {situacao.aberta && situacao.motivo !== 'ABERTA_MANUAL' && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={menu === 'pausar'}
              onClick={() => setMenu(menu === 'pausar' ? null : 'pausar')}
            >
              <Pause className="size-4" /> Pausar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={menu === 'fechar'}
              onClick={() => setMenu(menu === 'fechar' ? null : 'fechar')}
            >
              <Power className="size-4" /> Fechar
            </Button>
          </div>
        )}

        {!situacao.aberta && !pausada && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            aria-expanded={menu === 'abrir'}
            onClick={() => setMenu(menu === 'abrir' ? null : 'abrir')}
          >
            <Play className="size-4" /> Abrir agora
          </Button>
        )}

        {menu === 'pausar' && (
          <div className="space-y-1.5 rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">
              Parar de receber pedidos por um tempo. A loja continua aparecendo aberta no horário, e
              volta sozinha.
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {[15, 30, 60].map((minutos) => (
                <Button
                  key={minutos}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => ajustar('PAUSADA', minutos)}
                >
                  {minutos === 60 ? '1 h' : `${minutos} min`}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => ajustar('PAUSADA', null)}
            >
              Até eu retomar
            </Button>
          </div>
        )}

        {menu === 'fechar' && (
          <div className="space-y-1.5 rounded-lg bg-muted/50 p-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-auto w-full py-1.5 whitespace-normal"
              onClick={() => ajustar('FECHADA', null, proxima)}
            >
              {proxima
                ? `Até a próxima abertura (${quando(proxima, agora)})`
                : 'Até a próxima abertura'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => ajustar('FECHADA', null)}
            >
              Até eu reabrir
            </Button>
            <p className="text-xs text-muted-foreground">
              A primeira volta sozinha. A segunda fica fechada até alguém reabrir aqui.
            </p>
          </div>
        )}

        {menu === 'abrir' && (
          <div className="space-y-1.5 rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">
              Receber pedidos fora do horário. Sempre com hora para acabar: esquecida aberta, a loja
              receberia pedido de madrugada.
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {[30, 60, 120].map((minutos) => (
                <Button
                  key={minutos}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => ajustar('ABERTA', minutos)}
                >
                  {minutos === 30 ? '30 min' : `${minutos / 60} h`}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="abrirAte" className="text-xs text-muted-foreground">
                Até
              </label>
              <input
                id="abrirAte"
                type="time"
                value={ateAs}
                onChange={(evento) => setAteAs(evento.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
              />
              <Button type="button" size="sm" disabled={ateAs === ''} onClick={abrirAte}>
                Abrir
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
