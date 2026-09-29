'use client';

import type { PixDiretoDaLoja, TipoDeChavePix } from '@motoboycity/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Os dados do Pix direto, no que a loja digita: todos como texto, até serem
 * conferidos por `pixDiretoSchema` na hora de salvar.
 */
export type RascunhoDoPix = { [campo in keyof PixDiretoDaLoja]: string } & {
  tipoDeChave: TipoDeChavePix;
};

export type CampoDoPix = keyof RascunhoDoPix;

export const RASCUNHO_VAZIO: RascunhoDoPix = {
  tipoDeChave: 'CELULAR',
  chave: '',
  nomeDoRecebedor: '',
  cidade: '',
  whatsapp: '',
};

export function rascunhoDoPix(salvo: PixDiretoDaLoja | null): RascunhoDoPix {
  return salvo ? { ...salvo } : RASCUNHO_VAZIO;
}

const TIPOS: Array<{ valor: TipoDeChavePix; titulo: string; exemplo: string }> = [
  { valor: 'CELULAR', titulo: 'Celular', exemplo: '(33) 99988-7766' },
  { valor: 'CPF_CNPJ', titulo: 'CPF ou CNPJ', exemplo: '123.456.789-09' },
  { valor: 'EMAIL', titulo: 'E-mail', exemplo: 'loja@exemplo.com' },
  {
    valor: 'ALEATORIA',
    titulo: 'Chave aleatória',
    exemplo: '123e4567-e12b-12d1-a456-426655440000',
  },
];

/**
 * Os campos do Pix direto, logo abaixo da forma marcada. O erro de cada campo
 * fica escrito embaixo dele; o botão de salvar não se desabilita por isso — quem
 * o toca vê o que falta, e o primeiro campo com erro recebe o foco.
 */
export function PixDiretoDaLojaCampos({
  valor,
  aoMudar,
  erros,
}: {
  valor: RascunhoDoPix;
  aoMudar: (campo: CampoDoPix, texto: string) => void;
  erros: Partial<Record<CampoDoPix, string>>;
}) {
  const exemplo = TIPOS.find((tipo) => tipo.valor === valor.tipoDeChave)?.exemplo ?? '';

  function campo(
    id: CampoDoPix,
    rotulo: string,
    opcoes: { dica?: string; maxLength?: number; placeholder?: string; inputMode?: 'tel' },
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`pix-${id}`}>{rotulo}</Label>
        <Input
          id={`pix-${id}`}
          value={valor[id]}
          onChange={(evento) => aoMudar(id, evento.target.value)}
          maxLength={opcoes.maxLength}
          placeholder={opcoes.placeholder}
          inputMode={opcoes.inputMode}
          aria-invalid={erros[id] ? true : undefined}
          aria-describedby={`pix-${id}-ajuda`}
        />
        <p
          id={`pix-${id}-ajuda`}
          className={erros[id] ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
          role={erros[id] ? 'alert' : undefined}
        >
          {erros[id] ?? opcoes.dica ?? ''}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3">
      <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        Sem gateway, nada confirma o pagamento sozinho: o cliente paga na sua chave e envia o
        comprovante pelo seu WhatsApp, e você confirma em Vendas. O pedido aparece na hora, e o
        motoboy não cobra nada do cliente na porta.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pix-tipoDeChave">Tipo da chave</Label>
          <select
            id="pix-tipoDeChave"
            value={valor.tipoDeChave}
            onChange={(evento) => aoMudar('tipoDeChave', evento.target.value)}
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-base pointer-coarse:h-11 md:text-sm"
          >
            {TIPOS.map((tipo) => (
              <option key={tipo.valor} value={tipo.valor}>
                {tipo.titulo}
              </option>
            ))}
          </select>
          {/* Um espaço do tamanho da ajuda dos outros campos alinha a linha. */}
          <p className="text-xs text-muted-foreground">Escolha o tipo da chave que vai digitar.</p>
        </div>
        {campo('chave', 'Chave Pix', {
          placeholder: exemplo,
          dica: 'Só você e o cliente do pedido a veem.',
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {campo('nomeDoRecebedor', 'Nome que aparece no banco', {
          maxLength: 25,
          dica: 'É o que o cliente lê antes de confirmar o Pix. Até 25 caracteres.',
        })}
        {campo('cidade', 'Cidade', { maxLength: 15, dica: 'Até 15 caracteres.' })}
      </div>

      {campo('whatsapp', 'WhatsApp da loja', {
        inputMode: 'tel',
        placeholder: '(33) 99988-7766',
        dica: 'Com DDD. É para onde o cliente manda o comprovante.',
      })}
    </div>
  );
}
