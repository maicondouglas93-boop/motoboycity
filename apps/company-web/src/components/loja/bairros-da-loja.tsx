'use client';

import { useState } from 'react';
import type { BairroAtendido } from '@motoboycity/types';
import { chaveDoBairro } from '@motoboycity/validation';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { mesmoConteudo, useGravarOperacao, useOperacaoDaLoja } from '@/components/loja/operacao';
import { novaChave, precoParaTexto, textoParaPreco } from '@/components/loja/produto-no-formulario';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { companyStoreOperationApi } from '@/lib/api-client';

interface LinhaDeBairro {
  id: string;
  nome: string;
  taxa: string;
}

/** O mesmo teto que a API aceita. */
const TAXA_MAXIMA = 999.99;
const MAXIMO_DE_BAIRROS = 200;

/**
 * Os bairros que a loja atende, cada um com a taxa que ELA cobra do cliente.
 * Bairro fora da lista não aparece no checkout: é assim que a loja limita a
 * área de entrega.
 */
export function BairrosDaLoja() {
  const consulta = useOperacaoDaLoja();
  const [versao, setVersao] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bairros que você atende</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          O cliente escolhe o bairro no checkout e a taxa entra no total. Bairro que não está aqui
          não aparece para ele — <strong>é assim que você limita sua área de entrega</strong>.
        </p>
        {consulta.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">Não foi possível carregar os bairros.</p>
            <Button type="button" variant="outline" onClick={() => void consulta.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : !consulta.data ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <Formulario
            key={versao}
            salvos={consulta.data.bairros}
            onDescartar={() => setVersao((atual) => atual + 1)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Formulario({
  salvos,
  onDescartar,
}: {
  salvos: BairroAtendido[];
  onDescartar: () => void;
}) {
  const [linhas, setLinhas] = useState<LinhaDeBairro[]>(() =>
    salvos.map((bairro) => ({
      id: bairro.id,
      nome: bairro.nome,
      taxa: precoParaTexto(bairro.taxa),
    })),
  );
  const gravar = useGravarOperacao(companyStoreOperationApi.updateDeliveryAreas);

  const bairros: BairroAtendido[] = linhas.map((linha) => ({
    id: linha.id,
    nome: linha.nome.trim(),
    taxa: textoParaPreco(linha.taxa) ?? Number.NaN,
  }));

  // As mesmas regras da API, ditas antes do salvar e com o nome do bairro. Num
  // conjunto: duas linhas em branco dariam a mesma frase duas vezes — e a frase
  // é a chave de cada aviso na tela.
  const avisos = new Set<string>();
  const vistos = new Set<string>();
  for (const bairro of bairros) {
    const qual = bairro.nome ? `de ${bairro.nome}` : 'de um bairro sem nome';
    if (!bairro.nome) avisos.add('Um bairro está sem nome.');
    if (Number.isNaN(bairro.taxa)) {
      avisos.add(`A taxa ${qual} tem que ser um valor, como 8,00 — ou 0,00, sem taxa.`);
    } else if (bairro.taxa > TAXA_MAXIMA) {
      avisos.add(`A taxa ${qual} passa de R$ 999,99.`);
    }
    const chave = chaveDoBairro(bairro.nome);
    if (bairro.nome && vistos.has(chave)) avisos.add(`${bairro.nome} aparece duas vezes.`);
    vistos.add(chave);
  }
  if (bairros.length > MAXIMO_DE_BAIRROS) {
    avisos.add(`Use no máximo ${MAXIMO_DE_BAIRROS} bairros.`);
  }
  const problemas = [...avisos];
  const mudou = !mesmoConteudo(bairros, salvos);

  function alterar(id: string, campo: 'nome' | 'taxa', valor: string) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.id === id ? { ...linha, [campo]: valor } : linha)),
    );
  }

  return (
    <>
      {linhas.length > 0 && (
        <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_140px_40px]">
          <span>Bairro</span>
          <span>Taxa</span>
          <span />
        </div>
      )}

      {linhas.map((linha) => (
        <div key={linha.id} className="grid gap-2 sm:grid-cols-[1fr_140px_40px] sm:items-center">
          <Input
            value={linha.nome}
            onChange={(evento) => alterar(linha.id, 'nome', evento.target.value)}
            maxLength={60}
            aria-label="Nome do bairro"
            placeholder="Centro"
          />
          <Input
            value={linha.taxa}
            onChange={(evento) => alterar(linha.id, 'taxa', evento.target.value)}
            inputMode="decimal"
            aria-label={'Taxa de ' + (linha.nome || 'bairro sem nome')}
            placeholder="8,00"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={'Remover ' + (linha.nome || 'bairro sem nome')}
            onClick={() => setLinhas((atual) => atual.filter((item) => item.id !== linha.id))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setLinhas((atual) => [...atual, { id: novaChave(), nome: '', taxa: '' }])}
      >
        <Plus className="size-4" /> Acrescentar bairro
      </Button>

      {linhas.length === 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          Sem bairro nenhum, sua página não tem como calcular a entrega e não aceita pedido de
          entrega. Cadastre ao menos um.
        </p>
      ) : (
        /* Confundir os dois valores é o erro provável, e ele custa dinheiro da
           loja em toda entrega. */
        <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
          Estes valores são o que <strong>você cobra do cliente</strong>, e não o que a central
          cobra de você. São números independentes: cobre mais, menos ou nada, que a entrega
          continua entrando na sua fatura do mesmo jeito.
        </p>
      )}

      {problemas.map((texto) => (
        <p
          key={texto}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <span>{texto}</span>
        </p>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!mudou || problemas.length > 0 || gravar.isPending}
          onClick={() => gravar.mutate({ bairros })}
        >
          {gravar.isPending ? 'Salvando...' : 'Salvar bairros'}
        </Button>
        {mudou && (
          <Button type="button" variant="ghost" onClick={onDescartar}>
            Descartar alterações
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {problemas.length > 0
            ? 'Resolva o que está em vermelho para salvar.'
            : mudou
              ? 'Há alterações não salvas.'
              : 'Tudo salvo.'}
        </span>
      </div>
      {gravar.isError && (
        <p className="text-sm text-destructive" role="alert">
          {mensagemDoErro(gravar.error, 'Não foi possível salvar os bairros.')}
        </p>
      )}
    </>
  );
}
