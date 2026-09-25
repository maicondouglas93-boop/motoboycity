'use client';

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  StoreCatalog,
  StoreCategory,
  StoreProduct,
  StoreProductStatus,
} from '@motoboycity/types';
import type { UpsertStoreProductPayload } from '@motoboycity/validation';
import { AlertCircle, Check, ChevronLeft, ImageOff, ImagePlus, Plus, Trash2 } from 'lucide-react';
import {
  CHAVE_DO_CATALOGO,
  chaveDaExclusao,
  comProdutoSalvo,
  mensagemDoErro,
  semProduto,
} from '@/components/loja/catalogo';
import {
  LIMITES_DO_PRODUTO,
  montarPayload,
  novaChave,
  pendenciasDoFormulario,
  problemaDaFoto,
  produtoParaFormulario,
  saidasDoFormulario,
  type GrupoNoFormulario,
  type LinhaDeEscolha,
  type LinhaDeTamanho,
  type ProdutoNoFormulario,
} from '@/components/loja/produto-no-formulario';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyStoreCatalogApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * Um formulário só para cadastrar e para editar.
 *
 * Duas telas separadas divergiriam: uma regra nova entraria na de cadastro e
 * seria esquecida na de edição, e o produto editado passaria a aceitar o que o
 * recém-criado recusa. Aqui a diferença é só o estado inicial e o rótulo dos
 * botões.
 */

/** O cabeçalho das telas de produto — o formulário e os estados de carregando e de erro. */
export function MolduraDoProduto({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link
          href="/loja/produtos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Produtos
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{titulo}</h1>
      </div>
      {children}
    </div>
  );
}

/**
 * Descreve o grupo na língua de quem vende, e não em mínimo/máximo.
 *
 * "mín 1, máx 1" não diz nada ao lojista; "obrigatório, escolha 1" diz — e é o
 * que permite ele conferir se configurou o que queria sem aprender a regra.
 */
function descreverGrupo(grupo: GrupoNoFormulario): string {
  const min = Number(grupo.minimo) || 0;
  const max = grupo.maximo.trim() === '' ? null : Number(grupo.maximo);

  if (min === 0 && max === null) return 'Opcional, sem limite';
  if (min === 0 && max === 1) return 'Opcional, escolha 1';
  if (min === 0) return `Opcional, até ${max}`;
  if (max === null) return `Obrigatório, ao menos ${min}`;
  if (min === max) return `Obrigatório, escolha ${min}`;
  return `Obrigatório, de ${min} a ${max}`;
}

function textoSemPendencia(atual: StoreProductStatus | undefined): string {
  switch (atual) {
    case undefined:
      return 'Pronto para publicar. Publicado, ele entra no cardápio da loja.';
    case 'PUBLISHED':
      return 'Continua no ar depois de salvar.';
    case 'DRAFT':
      return 'Pronto para publicar.';
    case 'PAUSED':
      return 'Pausado: salvar mantém o produto fora da loja até você voltar a vender.';
  }
}

export function FormularioDeProduto({
  produto,
  categorias,
  avisoDaFoto = null,
}: {
  produto?: StoreProduct;
  categorias: StoreCategory[];
  /** O cadastro salvou o produto, mas a foto não subiu: a edição avisa. */
  avisoDaFoto?: string | null;
}) {
  const token = session.getToken();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<ProdutoNoFormulario>(() => produtoParaFormulario(produto));
  const [erros, setErros] = useState<string[]>([]);
  const [erroDaFoto, setErroDaFoto] = useState<string | null>(avisoDaFoto);
  /**
   * No cadastro, a foto espera o produto existir: ela sobe logo depois do
   * primeiro salvar. Na edição, sobe na hora — não há o que esperar.
   */
  const [fotoPendente, setFotoPendente] = useState<File | null>(null);

  // A prévia da foto pendente é um endereço do navegador; solta quando troca.
  useEffect(() => {
    const url = estado.imagemUrl;
    return () => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  }, [estado.imagemUrl]);
  /** `null`: o campo de nova categoria está fechado. */
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const salvar = useMutation({
    mutationFn: (payload: UpsertStoreProductPayload) =>
      produto
        ? companyStoreCatalogApi.updateProduct(token as string, produto.id, payload)
        : companyStoreCatalogApi.createProduct(token as string, payload),
    onSuccess: async (salvo) => {
      let final = salvo;
      let fotoFalhou = false;
      if (!produto && fotoPendente) {
        try {
          final = await companyStoreCatalogApi.uploadProductImage(
            token as string,
            salvo.id,
            fotoPendente,
          );
        } catch {
          fotoFalhou = true;
        }
      }
      queryClient.setQueryData<StoreCatalog>(
        CHAVE_DO_CATALOGO,
        (atual) => atual && comProdutoSalvo(atual, final),
      );
      void queryClient.invalidateQueries({ queryKey: CHAVE_DO_CATALOGO });
      // O produto está salvo; só a foto ficou para trás. A edição dele diz
      // isso e deixa tentar de novo, em vez de a foto sumir calada.
      router.push(fotoFalhou ? `/loja/produtos/${salvo.id}/editar?foto=falhou` : '/loja/produtos');
    },
  });

  function comFoto(salvo: StoreProduct) {
    setErroDaFoto(null);
    setEstado((antes) => ({ ...antes, imagemUrl: salvo.imageUrl }));
    queryClient.setQueryData<StoreCatalog>(
      CHAVE_DO_CATALOGO,
      (atual) => atual && comProdutoSalvo(atual, salvo),
    );
  }

  const enviarFoto = useMutation({
    mutationFn: (foto: File) =>
      companyStoreCatalogApi.uploadProductImage(token as string, produto!.id, foto),
    onSuccess: comFoto,
    onError: (falha) => setErroDaFoto(mensagemDoErro(falha, 'Não foi possível enviar a foto.')),
  });

  const tirarFoto = useMutation({
    mutationFn: () => companyStoreCatalogApi.removeProductImage(token as string, produto!.id),
    onSuccess: comFoto,
    onError: (falha) => setErroDaFoto(mensagemDoErro(falha, 'Não foi possível tirar a foto.')),
  });

  const mexendoNaFoto = enviarFoto.isPending || tirarFoto.isPending;

  function escolherFoto(evento: ChangeEvent<HTMLInputElement>) {
    const foto = evento.target.files?.[0];
    // Limpa o campo: escolher a mesma foto de novo, depois de um erro, é mudança.
    evento.target.value = '';
    if (!foto) return;
    const problema = problemaDaFoto(foto);
    if (problema) {
      setErroDaFoto(problema);
      return;
    }
    setErroDaFoto(null);
    if (produto) {
      enviarFoto.mutate(foto);
      return;
    }
    setFotoPendente(foto);
    setEstado((antes) => ({ ...antes, imagemUrl: URL.createObjectURL(foto) }));
  }

  function descartarFoto() {
    if (produto) {
      tirarFoto.mutate();
      return;
    }
    setFotoPendente(null);
    setEstado((antes) => ({ ...antes, imagemUrl: null }));
  }

  const criarCategoria = useMutation({
    mutationFn: (name: string) => companyStoreCatalogApi.createCategory(token as string, { name }),
    onSuccess: (categoria) => {
      queryClient.setQueryData<StoreCatalog>(
        CHAVE_DO_CATALOGO,
        (atual) => atual && { ...atual, categories: [...atual.categories, categoria] },
      );
      setEstado((atual) => ({ ...atual, categoriaId: categoria.id }));
      setNovaCategoria(null);
    },
  });

  const excluir = useMutation({
    mutationKey: chaveDaExclusao(produto?.id ?? ''),
    mutationFn: () => companyStoreCatalogApi.deleteProduct(token as string, produto!.id),
    onSuccess: () => {
      router.push('/loja/produtos');
      queryClient.setQueryData<StoreCatalog>(
        CHAVE_DO_CATALOGO,
        (atual) => atual && semProduto(atual, produto!.id),
      );
    },
  });

  /**
   * Ou o produto tem preço único, ou tem tamanhos — nunca os dois.
   *
   * É a regra que evita o erro que a loja comete sozinha: cadastrar "Açaí
   * 300ml", "Açaí 500ml" e "Açaí 700ml" como três produtos. Aqui o açaí é um
   * produto só, e o tamanho é uma escolha dentro dele.
   */
  const usaTamanhos = estado.tamanhos.length > 0;

  /**
   * O que impede PUBLICAR — e não o que impede salvar. Rascunho aceita tudo
   * pela metade, que é para isso que ele serve. É a mesma regra do servidor:
   * o que a tela libera para publicar, a API aceita.
   */
  const pendencias = pendenciasDoFormulario(estado);
  const bloqueios = pendencias.filter((item) => item.blocking);
  const recomendacoes = pendencias.filter((item) => !item.blocking);

  const atual = produto?.status;
  const saidas = saidasDoFormulario(atual, bloqueios.length > 0);
  const saiDoAr = atual === 'PUBLISHED' && bloqueios.length > 0;
  const ocupado =
    salvar.isPending || salvar.isSuccess || excluir.isPending || excluir.isSuccess || mexendoNaFoto;

  function salvarComo(status: StoreProductStatus) {
    const montagem = montarPayload(estado, status);
    if (!montagem.ok) {
      setErros(montagem.erros);
      return;
    }
    setErros([]);
    salvar.mutate(montagem.payload);
  }

  function criarACategoria() {
    const nome = novaCategoria?.trim() ?? '';
    if (nome === '' || criarCategoria.isPending) return;
    criarCategoria.mutate(nome);
  }

  function acrescentarTamanho() {
    const chave = novaChave();
    setEstado((antes) => ({
      ...antes,
      tamanhos: [
        ...antes.tamanhos,
        {
          chave,
          nome: '',
          // O primeiro tamanho herda o preço único: passar de "um preço" para
          // "por tamanho" não apaga o que já estava digitado.
          preco: antes.tamanhos.length === 0 ? antes.precoUnico : '',
          disponivel: true,
        },
      ],
    }));
  }

  function alterarTamanho(chave: string, mudanca: Partial<LinhaDeTamanho>) {
    setEstado((antes) => ({
      ...antes,
      tamanhos: antes.tamanhos.map((linha) =>
        linha.chave === chave ? { ...linha, ...mudanca } : linha,
      ),
    }));
  }

  function removerTamanho(chave: string) {
    setEstado((antes) => ({
      ...antes,
      tamanhos: antes.tamanhos.filter((linha) => linha.chave !== chave),
    }));
  }

  /**
   * O primeiro grupo nasce como "Adicionais", opcional e sem limite — que é o
   * caso da esmagadora maioria. A loja simples nunca precisa entender que
   * existe configuração ali; quem precisa de "escolha 1 cobertura" muda dois
   * campos.
   */
  function acrescentarGrupo() {
    const chave = novaChave();
    setEstado((antes) => ({
      ...antes,
      grupos: [
        ...antes.grupos,
        {
          chave,
          nome: antes.grupos.length === 0 ? 'Adicionais' : '',
          minimo: '0',
          maximo: '',
          escolhas: [],
        },
      ],
    }));
  }

  function alterarGrupo(
    chave: string,
    mudanca: Partial<Pick<GrupoNoFormulario, 'nome' | 'minimo' | 'maximo'>>,
  ) {
    setEstado((antes) => ({
      ...antes,
      grupos: antes.grupos.map((grupo) =>
        grupo.chave === chave ? { ...grupo, ...mudanca } : grupo,
      ),
    }));
  }

  function removerGrupo(chave: string) {
    setEstado((antes) => ({
      ...antes,
      grupos: antes.grupos.filter((grupo) => grupo.chave !== chave),
    }));
  }

  function mudarEscolhas(
    grupoChave: string,
    mudar: (escolhas: LinhaDeEscolha[]) => LinhaDeEscolha[],
  ) {
    setEstado((antes) => ({
      ...antes,
      grupos: antes.grupos.map((grupo) =>
        grupo.chave === grupoChave ? { ...grupo, escolhas: mudar(grupo.escolhas) } : grupo,
      ),
    }));
  }

  function acrescentarEscolha(grupoChave: string) {
    const chave = novaChave();
    mudarEscolhas(grupoChave, (escolhas) => [
      ...escolhas,
      { chave, nome: '', preco: '', disponivel: true },
    ]);
  }

  function alterarEscolha(grupoChave: string, chave: string, mudanca: Partial<LinhaDeEscolha>) {
    mudarEscolhas(grupoChave, (escolhas) =>
      escolhas.map((escolha) => (escolha.chave === chave ? { ...escolha, ...mudanca } : escolha)),
    );
  }

  function removerEscolha(grupoChave: string, chave: string) {
    mudarEscolhas(grupoChave, (escolhas) => escolhas.filter((escolha) => escolha.chave !== chave));
  }

  return (
    <MolduraDoProduto titulo={produto ? 'Editar produto' : 'Cadastrar produto'}>
      {/* Enter num campo não publica nada: cada saída é um botão, clicado. */}
      <form className="space-y-5" onSubmit={(event) => event.preventDefault()} noValidate>
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
                value={estado.nome}
                maxLength={LIMITES_DO_PRODUTO.nome}
                onChange={(event) => setEstado((antes) => ({ ...antes, nome: event.target.value }))}
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
                value={estado.descricao}
                maxLength={LIMITES_DO_PRODUTO.descricao}
                onChange={(event) =>
                  setEstado((antes) => ({ ...antes, descricao: event.target.value }))
                }
                placeholder="Açaí cremoso batido na hora, com opção de adicionais"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria</Label>
                <select
                  id="categoria"
                  name="categoria"
                  value={estado.categoriaId}
                  onChange={(event) =>
                    setEstado((antes) => ({ ...antes, categoriaId: event.target.value }))
                  }
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.name}
                    </option>
                  ))}
                </select>

                {/* Criar a seção aqui mesmo: a loja nova chega ao primeiro
                    produto sem nenhuma, e sair para Organizar perderia o que
                    já foi digitado. */}
                {novaCategoria === null ? (
                  <button
                    type="button"
                    onClick={() => setNovaCategoria('')}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    + Nova categoria
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={novaCategoria}
                      maxLength={60}
                      autoFocus
                      onChange={(event) => setNovaCategoria(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          criarACategoria();
                        } else if (event.key === 'Escape') {
                          setNovaCategoria(null);
                        }
                      }}
                      placeholder="Ex.: Lanches"
                      aria-label="Nome da nova categoria"
                      className="h-8 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={criarACategoria}
                      disabled={novaCategoria.trim() === '' || criarCategoria.isPending}
                    >
                      {criarCategoria.isPending ? 'Criando...' : 'Criar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setNovaCategoria(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
                {criarCategoria.isError && (
                  <p className="text-xs text-destructive" role="alert">
                    {mensagemDoErro(criarCategoria.error, 'Não foi possível criar a categoria.')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Foto</Label>
                <div className="flex items-center gap-3">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {estado.imagemUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={estado.imagemUrl}
                        alt={`Foto de ${estado.nome || 'produto'}`}
                        className="size-20 object-cover"
                      />
                    ) : (
                      <ImageOff className="size-6 text-muted-foreground/60" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <label
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                        className: mexendoNaFoto
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer',
                      })}
                    >
                      <ImagePlus className="size-4" aria-hidden="true" />
                      {estado.imagemUrl ? 'Trocar foto' : 'Adicionar foto'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={mexendoNaFoto}
                        onChange={escolherFoto}
                      />
                    </label>
                    {estado.imagemUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={mexendoNaFoto}
                        onClick={descartarFoto}
                      >
                        Remover foto
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG ou WebP, até 5 MB.{' '}
                  {produto
                    ? 'A foto é salva na hora.'
                    : 'A foto sobe junto com o produto, ao salvar.'}
                </p>
                {mexendoNaFoto && (
                  <p className="text-xs text-muted-foreground" role="status">
                    {enviarFoto.isPending ? 'Enviando a foto...' : 'Tirando a foto...'}
                  </p>
                )}
                {erroDaFoto && (
                  <p className="text-xs text-destructive" role="alert">
                    {erroDaFoto}
                  </p>
                )}
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
                  value={estado.precoUnico}
                  onChange={(event) =>
                    setEstado((antes) => ({ ...antes, precoUnico: event.target.value }))
                  }
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
                {estado.tamanhos.map((linha) => (
                  <div
                    key={linha.chave}
                    className="grid gap-2 sm:grid-cols-[1fr_140px_110px_40px] sm:items-center"
                  >
                    <Input
                      value={linha.nome}
                      maxLength={LIMITES_DO_PRODUTO.nomeDoTamanho}
                      onChange={(event) =>
                        alterarTamanho(linha.chave, { nome: event.target.value })
                      }
                      placeholder="500ml"
                      aria-label="Nome do tamanho"
                    />
                    <Input
                      value={linha.preco}
                      onChange={(event) =>
                        alterarTamanho(linha.chave, { preco: event.target.value })
                      }
                      inputMode="decimal"
                      placeholder="18,00"
                      aria-label="Preço do tamanho"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={linha.disponivel}
                        onCheckedChange={(valor) =>
                          alterarTamanho(linha.chave, { disponivel: valor === true })
                        }
                      />
                      <span className="sm:sr-only">Disponível</span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover o tamanho ${linha.nome || 'sem nome'}`}
                      onClick={() => removerTamanho(linha.chave)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={acrescentarTamanho}
              disabled={estado.tamanhos.length >= LIMITES_DO_PRODUTO.tamanhos}
            >
              <Plus className="size-4" /> Adicionar tamanho
            </Button>

            {!usaTamanhos && (
              <p className="text-xs text-muted-foreground">
                Vende em mais de um tamanho? Adicione os tamanhos em vez de cadastrar um produto
                para cada — o preço passa a ser por tamanho.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grupos de escolhas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {estado.grupos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum grupo. Use para o que o cliente escolhe por cima — adicionais do açaí, ponto
                da carne, borda da pizza, cobertura do sorvete.
              </p>
            )}

            {estado.grupos.map((grupo) => {
              const obrigatorio = (Number(grupo.minimo) || 0) >= 1;
              return (
                <div key={grupo.chave} className="space-y-3 rounded-xl border p-4">
                  <div className="grid gap-2 sm:grid-cols-[1fr_90px_90px_40px] sm:items-end">
                    <div className="space-y-1">
                      <Label htmlFor={`gn-${grupo.chave}`} className="text-xs">
                        Nome do grupo
                      </Label>
                      <Input
                        id={`gn-${grupo.chave}`}
                        value={grupo.nome}
                        maxLength={LIMITES_DO_PRODUTO.nomeDoGrupo}
                        onChange={(event) =>
                          alterarGrupo(grupo.chave, { nome: event.target.value })
                        }
                        placeholder="Adicionais"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`gmin-${grupo.chave}`} className="text-xs">
                        Mínimo
                      </Label>
                      <Input
                        id={`gmin-${grupo.chave}`}
                        type="number"
                        min={0}
                        max={LIMITES_DO_PRODUTO.escolhasPorGrupo}
                        value={grupo.minimo}
                        onChange={(event) =>
                          alterarGrupo(grupo.chave, { minimo: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`gmax-${grupo.chave}`} className="text-xs">
                        Máximo
                      </Label>
                      <Input
                        id={`gmax-${grupo.chave}`}
                        type="number"
                        min={1}
                        max={LIMITES_DO_PRODUTO.escolhasPorGrupo}
                        value={grupo.maximo}
                        onChange={(event) =>
                          alterarGrupo(grupo.chave, { maximo: event.target.value })
                        }
                        placeholder="livre"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover o grupo ${grupo.nome || 'sem nome'}`}
                      onClick={() => removerGrupo(grupo.chave)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {/* A regra traduzida, para a loja conferir sem aprender mín/máx. */}
                  <p className="text-xs font-medium text-primary">{descreverGrupo(grupo)}</p>

                  <div className="space-y-2">
                    {grupo.escolhas.map((escolha) => (
                      <div
                        key={escolha.chave}
                        className="grid gap-2 sm:grid-cols-[1fr_140px_110px_40px] sm:items-center"
                      >
                        <Input
                          value={escolha.nome}
                          maxLength={LIMITES_DO_PRODUTO.nomeDaEscolha}
                          onChange={(event) =>
                            alterarEscolha(grupo.chave, escolha.chave, { nome: event.target.value })
                          }
                          placeholder="Morango"
                          aria-label="Nome da escolha"
                        />
                        <Input
                          value={escolha.preco}
                          onChange={(event) =>
                            alterarEscolha(grupo.chave, escolha.chave, {
                              preco: event.target.value,
                            })
                          }
                          inputMode="decimal"
                          placeholder="3,00"
                          aria-label="Quanto a escolha acrescenta"
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={escolha.disponivel}
                            onCheckedChange={(valor) =>
                              alterarEscolha(grupo.chave, escolha.chave, {
                                disponivel: valor === true,
                              })
                            }
                          />
                          <span className="sm:sr-only">Disponível</span>
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remover a escolha ${escolha.nome || 'sem nome'}`}
                          onClick={() => removerEscolha(grupo.chave, escolha.chave)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}

                    {grupo.escolhas.length === 0 && (
                      <p
                        className={`text-xs ${obrigatorio ? 'text-amber-700' : 'text-muted-foreground'}`}
                      >
                        {obrigatorio
                          ? 'Grupo obrigatório e vazio: o cliente abre o produto e não consegue concluir o pedido.'
                          : 'Grupo vazio não aparece para o cliente.'}
                      </p>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => acrescentarEscolha(grupo.chave)}
                      disabled={grupo.escolhas.length >= LIMITES_DO_PRODUTO.escolhasPorGrupo}
                    >
                      <Plus className="size-4" /> Adicionar escolha
                    </Button>
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={acrescentarGrupo}
              disabled={estado.grupos.length >= LIMITES_DO_PRODUTO.grupos}
            >
              <Plus className="size-4" /> Grupo de escolhas
            </Button>
          </CardContent>
        </Card>

        {/* Substitui o antigo "Produto ativo".
            Um booleano fazia "ainda não terminei" e "acabou hoje" caírem no
            mesmo estado. Aqui a saída do formulário é a decisão de publicar ou
            não, e pausar depois é assunto da lista. */}
        <Card className={saiDoAr ? 'border-destructive/40' : undefined}>
          <CardHeader>
            <CardTitle>Publicação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bloqueios.length === 0 ? (
              <p className="flex items-start gap-2 text-sm text-emerald-700">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {textoSemPendencia(atual)}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {saiDoAr
                    ? 'Estas alterações tiram o produto do ar:'
                    : 'Falta para poder publicar:'}
                </p>
                <ul className="space-y-1">
                  {bloqueios.map((item) => (
                    <li
                      key={item.text}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <AlertCircle
                        className={`mt-0.5 size-4 shrink-0 ${
                          saiDoAr ? 'text-destructive' : 'text-amber-600'
                        }`}
                        aria-hidden="true"
                      />
                      {item.text}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {saiDoAr
                    ? 'O produto está à venda agora. Salvar assim guarda o trabalho e o volta para rascunho, fora da loja — você o publica de novo quando resolver o que está acima.'
                    : atual === 'PAUSED'
                      ? 'Nada disso impede salvar — o produto continua pausado, fora da loja.'
                      : 'Nada disso impede salvar como rascunho — o cadastro fica guardado e não vai para a loja.'}
                </p>
              </div>
            )}
            {recomendacoes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Não impede vender, mas ajuda o cliente:{' '}
                {recomendacoes.map((item) => item.text).join(', ')}.
              </p>
            )}
          </CardContent>
        </Card>

        {erros.length > 0 && (
          <div className="space-y-1 text-sm text-destructive" role="alert">
            <p className="font-medium">Não deu para salvar ainda:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {erros.map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ul>
          </div>
        )}
        {salvar.isError && (
          <p className="text-sm text-destructive" role="alert">
            {mensagemDoErro(salvar.error, 'Não foi possível salvar o produto.')}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {saidas.map((saida) => (
            <Button
              key={saida.texto}
              type="button"
              variant={saida.variante}
              disabled={saida.desativada || ocupado}
              title={
                saida.desativada ? 'Resolva o que falta, acima, para poder publicar' : undefined
              }
              onClick={() => salvarComo(saida.status)}
            >
              {saida.texto}
            </Button>
          ))}
          <Link href="/loja/produtos" className="inline-flex items-center px-3 text-sm">
            Cancelar
          </Link>
          {salvar.isPending && (
            <span className="text-xs text-muted-foreground" role="status">
              Salvando...
            </span>
          )}
          {salvar.isSuccess && (
            <span className="text-xs text-emerald-700" role="status">
              Salvo. Voltando para a lista...
            </span>
          )}
        </div>
      </form>

      {/* Excluir fica longe dos botões de salvar, e pede confirmação: é a única
          ação daqui que não tem volta. */}
      {produto && (
        <Card className="border-destructive/30">
          <CardContent className="space-y-2 py-4 text-sm">
            {confirmandoExclusao ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  Excluir <strong>{produto.name}</strong> de vez? Não dá para desfazer.
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => excluir.mutate()}
                >
                  {excluir.isPending ? 'Excluindo...' : 'Excluir'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => setConfirmandoExclusao(false)}
                >
                  Manter
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-muted-foreground">
                  Parou de vender? Pausar, na lista, tira da loja e guarda o cadastro. Excluir apaga
                  de vez.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => setConfirmandoExclusao(true)}
                >
                  <Trash2 className="size-4" /> Excluir produto
                </Button>
              </div>
            )}
            {excluir.isError && (
              <p className="text-destructive" role="alert">
                {mensagemDoErro(excluir.error, 'Não foi possível excluir o produto.')}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </MolduraDoProduto>
  );
}
