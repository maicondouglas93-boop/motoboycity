'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, ChevronLeft, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CATEGORIAS_DE_EXEMPLO, type ProdutoDeExemplo } from '@/lib/loja-mock';

/**
 * Um formulário só para cadastrar e para editar.
 *
 * Duas telas separadas divergiriam: uma regra nova entraria na de cadastro e
 * seria esquecida na de edição, e o produto editado passaria a aceitar o que o
 * recém-criado recusa. Aqui a diferença é só o estado inicial e o rótulo dos
 * botões.
 */

interface LinhaDeTamanho {
  id: string;
  nome: string;
  preco: string;
  disponivel: boolean;
}

interface Escolha {
  id: string;
  nome: string;
  preco: string;
  disponivel: boolean;
}

interface GrupoDeEscolhas {
  id: string;
  nome: string;
  /** Texto, e não número: vazio no máximo quer dizer "sem limite". */
  minimo: string;
  maximo: string;
  escolhas: Escolha[];
}

function novoId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Preço em número vira texto de formulário no padrão brasileiro.
 *
 * Sem isto, o campo mostraria "18.5" para quem cadastrou "18,50" — e o lojista
 * conclui, com razão, que o sistema estragou o preço dele.
 */
function precoParaTexto(valor: number | null): string {
  if (valor === null) return '';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/**
 * Descreve o grupo na língua de quem vende, e não em mínimo/máximo.
 *
 * "mín 1, máx 1" não diz nada ao lojista; "obrigatório, escolha 1" diz — e é o
 * que permite ele conferir se configurou o que queria sem aprender a regra.
 */
function descreverGrupo(grupo: GrupoDeEscolhas): string {
  const min = Number(grupo.minimo) || 0;
  const max = grupo.maximo.trim() === '' ? null : Number(grupo.maximo);

  if (min === 0 && max === null) return 'Opcional, sem limite';
  if (min === 0 && max === 1) return 'Opcional, escolha 1';
  if (min === 0) return `Opcional, até ${max}`;
  if (max === null) return `Obrigatório, ao menos ${min}`;
  if (min === max) return `Obrigatório, escolha ${min}`;
  return `Obrigatório, de ${min} a ${max}`;
}

export function FormularioDeProduto({ produto }: { produto?: ProdutoDeExemplo }) {
  const editando = produto !== undefined;

  const [nome, setNome] = useState(produto?.nome ?? '');
  const [descricao, setDescricao] = useState(produto?.descricao ?? '');
  const [categoriaId, setCategoriaId] = useState(produto?.categoriaId ?? '');
  const [precoUnico, setPrecoUnico] = useState(precoParaTexto(produto?.precoUnico ?? null));
  const [tamanhos, setTamanhos] = useState<LinhaDeTamanho[]>(
    produto?.tamanhos.map((tamanho) => ({
      id: tamanho.id,
      nome: tamanho.nome,
      preco: precoParaTexto(tamanho.preco),
      disponivel: tamanho.disponivel,
    })) ?? [],
  );
  const [grupos, setGrupos] = useState<GrupoDeEscolhas[]>(
    produto?.grupos.map((grupo) => ({
      id: grupo.id,
      nome: grupo.nome,
      minimo: String(grupo.minimo),
      maximo: grupo.maximo === null ? '' : String(grupo.maximo),
      escolhas: grupo.escolhas.map((escolha) => ({
        id: escolha.id,
        nome: escolha.nome,
        preco: precoParaTexto(escolha.preco),
        disponivel: escolha.disponivel,
      })),
    })) ?? [],
  );

  /**
   * Ou o produto tem preço único, ou tem tamanhos — nunca os dois.
   *
   * É a regra que evita o erro que a loja comete sozinha: cadastrar "Açaí
   * 300ml", "Açaí 500ml" e "Açaí 700ml" como três produtos. Aqui o açaí é um
   * produto só, e o tamanho é uma escolha dentro dele.
   */
  const usaTamanhos = tamanhos.length > 0;

  /**
   * O que impede PUBLICAR — e não o que impede salvar.
   *
   * Rascunho aceita tudo pela metade, que é para isso que ele serve. A lista
   * abaixo é só o que faria o cliente abrir o produto na loja e não conseguir
   * comprar; falta de foto ou de descrição não entra aqui.
   */
  const bloqueios: string[] = [];

  if (nome.trim() === '') {
    bloqueios.push('falta o nome');
  }
  if (categoriaId === '') {
    bloqueios.push('falta a categoria — sem ela o produto não aparece em nenhuma seção da loja');
  }
  if (!usaTamanhos && precoUnico.trim() === '') {
    bloqueios.push('falta o preço');
  }

  const tamanhosIncompletos = tamanhos.filter(
    (tamanho) => tamanho.nome.trim() === '' || tamanho.preco.trim() === '',
  );
  if (tamanhosIncompletos.length > 0) {
    bloqueios.push(
      tamanhosIncompletos.length === 1
        ? '1 tamanho sem nome ou sem preço'
        : `${tamanhosIncompletos.length} tamanhos sem nome ou sem preço`,
    );
  }

  /*
   * Um grupo obrigatório sem escolhas disponíveis em número suficiente trava o
   * carrinho: o produto aparece na loja e o cliente não consegue concluir.
   */
  for (const grupo of grupos) {
    const minimo = Number(grupo.minimo) || 0;
    if (minimo < 1) continue;
    const disponiveis = grupo.escolhas.filter(
      (escolha) => escolha.disponivel && escolha.nome.trim() !== '',
    ).length;
    if (disponiveis < minimo) {
      bloqueios.push(
        `"${grupo.nome.trim() || 'grupo sem nome'}" exige ${minimo} e só tem ${disponiveis} ${
          disponiveis === 1 ? 'escolha disponível' : 'escolhas disponíveis'
        }`,
      );
    }
  }

  /**
   * O caso que só existe na edição: mexer num produto que está no ar e deixá-lo
   * sem poder ser comprado.
   *
   * Impedir de salvar seria prender o trabalho pela metade. Salvar e manter no
   * ar entregaria ao cliente um produto quebrado. Sai do ar, e o botão diz isso
   * antes de ser clicado.
   */
  const saiDoAr = editando && produto.situacao === 'publicado' && bloqueios.length > 0;

  function acrescentarTamanho() {
    setTamanhos((atual) => [...atual, { id: novoId(), nome: '', preco: '', disponivel: true }]);
  }

  function alterarTamanho(id: string, campo: keyof LinhaDeTamanho, valor: string | boolean) {
    setTamanhos((atual) =>
      atual.map((linha) => (linha.id === id ? { ...linha, [campo]: valor } : linha)),
    );
  }

  /**
   * O primeiro grupo nasce como "Adicionais", opcional e sem limite — que é o
   * caso da esmagadora maioria. A loja simples nunca precisa entender que
   * existe configuração ali; quem precisa de "escolha 1 cobertura" muda dois
   * campos.
   */
  function acrescentarGrupo() {
    setGrupos((atual) => [
      ...atual,
      {
        id: novoId(),
        nome: atual.length === 0 ? 'Adicionais' : '',
        minimo: '0',
        maximo: '',
        escolhas: [],
      },
    ]);
  }

  function alterarGrupo(id: string, campo: 'nome' | 'minimo' | 'maximo', valor: string) {
    setGrupos((atual) =>
      atual.map((grupo) => (grupo.id === id ? { ...grupo, [campo]: valor } : grupo)),
    );
  }

  function acrescentarEscolha(grupoId: string) {
    setGrupos((atual) =>
      atual.map((grupo) =>
        grupo.id === grupoId
          ? {
              ...grupo,
              escolhas: [
                ...grupo.escolhas,
                { id: novoId(), nome: '', preco: '', disponivel: true },
              ],
            }
          : grupo,
      ),
    );
  }

  function alterarEscolha(
    grupoId: string,
    escolhaId: string,
    campo: keyof Escolha,
    valor: string | boolean,
  ) {
    setGrupos((atual) =>
      atual.map((grupo) =>
        grupo.id === grupoId
          ? {
              ...grupo,
              escolhas: grupo.escolhas.map((escolha) =>
                escolha.id === escolhaId ? { ...escolha, [campo]: valor } : escolha,
              ),
            }
          : grupo,
      ),
    );
  }

  return (
    <form className="max-w-3xl space-y-5" onSubmit={(event) => event.preventDefault()} noValidate>
      <div>
        <Link
          href="/loja/produtos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Produtos
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {editando ? 'Editar produto' : 'Cadastrar produto'}
        </h1>
      </div>

      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          Tela de demonstração. O formulário não salva nada — serve para aprovar o desenho antes de
          ligar ao sistema.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações básicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              name="nome"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Açaí"
            />
            <p className="text-xs text-muted-foreground">
              O nome do item, sem o tamanho. Os tamanhos entram abaixo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Input
              id="descricao"
              name="descricao"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              placeholder="Açaí cremoso batido na hora, com opção de adicionais"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <select
                id="categoria"
                name="categoria"
                value={categoriaId}
                onChange={(event) => setCategoriaId(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Sem categoria</option>
                {CATEGORIAS_DE_EXEMPLO.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="foto">Foto</Label>
              <label
                htmlFor="foto"
                className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                <ImagePlus className="size-4" aria-hidden="true" />
                {produto?.imagemUrl ? 'Trocar foto' : 'Adicionar foto'}
              </label>
              <input id="foto" type="file" accept="image/*" className="sr-only" />
              <p className="text-xs text-muted-foreground">Opcional. JPG, PNG ou WebP.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!usaTamanhos && (
            <div className="max-w-40 space-y-2">
              <Label htmlFor="preco">Preço único</Label>
              <Input
                id="preco"
                inputMode="decimal"
                placeholder="22,00"
                value={precoUnico}
                onChange={(event) => setPrecoUnico(event.target.value)}
              />
            </div>
          )}

          {usaTamanhos && (
            <div className="space-y-2">
              {/* Preço CHEIO por tamanho, e não acréscimo sobre uma base: o
                  lojista pensa "o pequeno é doze", não "o pequeno é seis a
                  menos". */}
              <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_140px_110px_40px]">
                <span>Tamanho</span>
                <span>Preço</span>
                <span>Disponível</span>
                <span />
              </div>
              {tamanhos.map((linha) => (
                <div
                  key={linha.id}
                  className="grid gap-2 sm:grid-cols-[1fr_140px_110px_40px] sm:items-center"
                >
                  <Input
                    value={linha.nome}
                    onChange={(event) => alterarTamanho(linha.id, 'nome', event.target.value)}
                    placeholder="500ml"
                    aria-label="Nome do tamanho"
                  />
                  <Input
                    value={linha.preco}
                    onChange={(event) => alterarTamanho(linha.id, 'preco', event.target.value)}
                    inputMode="decimal"
                    placeholder="18,00"
                    aria-label="Preço do tamanho"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={linha.disponivel}
                      onCheckedChange={(valor) =>
                        alterarTamanho(linha.id, 'disponivel', valor === true)
                      }
                    />
                    <span className="sm:sr-only">Disponível</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover o tamanho ${linha.nome || 'sem nome'}`}
                    onClick={() =>
                      setTamanhos((atual) => atual.filter((item) => item.id !== linha.id))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button type="button" variant="outline" size="sm" onClick={acrescentarTamanho}>
            <Plus className="size-4" /> Adicionar tamanho
          </Button>

          {!usaTamanhos && (
            <p className="text-xs text-muted-foreground">
              Vende em mais de um tamanho? Adicione os tamanhos em vez de cadastrar um produto para
              cada — o preço passa a ser por tamanho.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grupos de escolhas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {grupos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum grupo. Use para o que o cliente escolhe por cima — adicionais do açaí, ponto da
              carne, borda da pizza, cobertura do sorvete.
            </p>
          )}

          {grupos.map((grupo) => (
            <div key={grupo.id} className="space-y-3 rounded-xl border p-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_90px_90px_40px] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor={`gn-${grupo.id}`} className="text-xs">
                    Nome do grupo
                  </Label>
                  <Input
                    id={`gn-${grupo.id}`}
                    value={grupo.nome}
                    onChange={(event) => alterarGrupo(grupo.id, 'nome', event.target.value)}
                    placeholder="Adicionais"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`gmin-${grupo.id}`} className="text-xs">
                    Mínimo
                  </Label>
                  <Input
                    id={`gmin-${grupo.id}`}
                    type="number"
                    min={0}
                    value={grupo.minimo}
                    onChange={(event) => alterarGrupo(grupo.id, 'minimo', event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`gmax-${grupo.id}`} className="text-xs">
                    Máximo
                  </Label>
                  <Input
                    id={`gmax-${grupo.id}`}
                    type="number"
                    min={1}
                    value={grupo.maximo}
                    onChange={(event) => alterarGrupo(grupo.id, 'maximo', event.target.value)}
                    placeholder="livre"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover o grupo ${grupo.nome || 'sem nome'}`}
                  onClick={() => setGrupos((atual) => atual.filter((item) => item.id !== grupo.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {/* A regra traduzida, para a loja conferir sem aprender mín/máx. */}
              <p className="text-xs font-medium text-primary">{descreverGrupo(grupo)}</p>

              <div className="space-y-2">
                {grupo.escolhas.map((escolha) => (
                  <div
                    key={escolha.id}
                    className="grid gap-2 sm:grid-cols-[1fr_140px_110px_40px] sm:items-center"
                  >
                    <Input
                      value={escolha.nome}
                      onChange={(event) =>
                        alterarEscolha(grupo.id, escolha.id, 'nome', event.target.value)
                      }
                      placeholder="Morango"
                      aria-label="Nome da escolha"
                    />
                    <Input
                      value={escolha.preco}
                      onChange={(event) =>
                        alterarEscolha(grupo.id, escolha.id, 'preco', event.target.value)
                      }
                      inputMode="decimal"
                      placeholder="3,00"
                      aria-label="Quanto a escolha acrescenta"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={escolha.disponivel}
                        onCheckedChange={(valor) =>
                          alterarEscolha(grupo.id, escolha.id, 'disponivel', valor === true)
                        }
                      />
                      <span className="sm:sr-only">Disponível</span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover a escolha ${escolha.nome || 'sem nome'}`}
                      onClick={() =>
                        setGrupos((atual) =>
                          atual.map((item) =>
                            item.id === grupo.id
                              ? {
                                  ...item,
                                  escolhas: item.escolhas.filter((e) => e.id !== escolha.id),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}

                {grupo.escolhas.length === 0 && (
                  <p
                    className={`text-xs ${
                      (Number(grupo.minimo) || 0) >= 1 ? 'text-amber-700' : 'text-muted-foreground'
                    }`}
                  >
                    {(Number(grupo.minimo) || 0) >= 1
                      ? 'Grupo obrigatório e vazio: o cliente abre o produto e não consegue concluir o pedido.'
                      : 'Grupo vazio não aparece para o cliente.'}
                  </p>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => acrescentarEscolha(grupo.id)}
                >
                  <Plus className="size-4" /> Adicionar escolha
                </Button>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={acrescentarGrupo}>
            <Plus className="size-4" /> Grupo de escolhas
          </Button>
        </CardContent>
      </Card>

      {/* Substitui o antigo "Produto ativo".
          Um booleano fazia "ainda não terminei" e "acabou hoje" caírem no mesmo
          estado. Aqui a saída do formulário é a decisão de publicar ou não, e
          pausar depois é assunto da lista. */}
      <Card className={saiDoAr ? 'border-destructive/40' : undefined}>
        <CardHeader>
          <CardTitle>Publicação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bloqueios.length === 0 ? (
            <p className="flex items-start gap-2 text-sm text-emerald-700">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {editando && produto.situacao === 'publicado'
                ? 'Continua no ar depois de salvar.'
                : 'Pronto para publicar. Assim que salvar, o produto aparece na loja.'}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {saiDoAr ? 'Estas alterações tiram o produto do ar:' : 'Falta para poder publicar:'}
              </p>
              <ul className="space-y-1">
                {bloqueios.map((texto) => (
                  <li key={texto} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertCircle
                      className={`mt-0.5 size-4 shrink-0 ${
                        saiDoAr ? 'text-destructive' : 'text-amber-600'
                      }`}
                      aria-hidden="true"
                    />
                    {texto}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {saiDoAr
                  ? 'O produto está à venda agora. Salvar assim guarda o trabalho e o tira da loja — você o publica de novo quando resolver o que está acima.'
                  : 'Nada disso impede salvar como rascunho — o cadastro fica guardado e não vai para a loja.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {editando ? (
          <Button type="submit" variant={saiDoAr ? 'destructive' : 'default'} disabled>
            {saiDoAr ? 'Salvar e tirar do ar' : 'Salvar alterações'}
          </Button>
        ) : (
          <>
            <Button type="submit" disabled>
              Publicar produto
            </Button>
            <Button type="button" variant="outline" disabled>
              Salvar rascunho
            </Button>
          </>
        )}
        <Link href="/loja/produtos" className="inline-flex items-center px-3 text-sm">
          Cancelar
        </Link>
        <span className="text-xs text-muted-foreground">
          Salvar está desativado enquanto a tela não está ligada ao sistema.
        </span>
      </div>
    </form>
  );
}
