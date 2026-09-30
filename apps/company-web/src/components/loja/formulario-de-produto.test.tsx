import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@motoboycity/api-client';
import type { StoreCatalog, StoreProduct } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormularioDeProduto } from '@/components/loja/formulario-de-produto';
import { CHAVE_DO_CATALOGO } from '@/components/loja/catalogo';

const mocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  createCategory: vi.fn(),
  uploadProductImage: vi.fn(),
  removeProductImage: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreCatalogApi: {
    createProduct: mocks.createProduct,
    updateProduct: mocks.updateProduct,
    deleteProduct: mocks.deleteProduct,
    createCategory: mocks.createCategory,
    uploadProductImage: mocks.uploadProductImage,
    removeProductImage: mocks.removeProductImage,
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

const LANCHES = { id: '11111111-1111-4111-8111-111111111111', name: 'Lanches' };

const NO_AR: StoreProduct = {
  id: '22222222-2222-4222-8222-222222222222',
  categoryId: LANCHES.id,
  name: 'X-Burger',
  description: 'Pão, carne e queijo',
  imageUrl: null,
  price: 22,
  status: 'PUBLISHED',
  stock: null,
  kind: 'PRODUCT',
  comboItems: [],
  sizes: [],
  optionGroups: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Ponto da carne',
      minChoices: 1,
      maxChoices: 1,
      options: [
        { id: '55555555-5555-4555-8555-555555555551', name: 'Ao ponto', price: 0, available: true },
      ],
    },
  ],
  updatedAt: '2026-09-25T12:00:00.000Z',
};

function renderizar(produto?: StoreProduct) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const catalogo: StoreCatalog = { categories: [LANCHES], products: produto ? [produto] : [] };
  queryClient.setQueryData(CHAVE_DO_CATALOGO, catalogo);
  render(
    <QueryClientProvider client={queryClient}>
      <FormularioDeProduto produto={produto} categorias={[LANCHES]} />
    </QueryClientProvider>,
  );
  return queryClient;
}

const botao = (nome: string) => screen.getByRole('button', { name: nome });

describe('Formulário de produto', () => {
  beforeEach(() => {
    window.localStorage.setItem('motoboycity.accessToken', 'token');
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it('cadastra e publica o que foi digitado, e volta para a lista', async () => {
    mocks.createProduct.mockResolvedValue({ ...NO_AR, optionGroups: [] });
    renderizar();

    expect(botao('Publicar produto')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: ' X-Burger ' } });
    fireEvent.change(screen.getByLabelText('Preço único'), { target: { value: '22,00' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: LANCHES.id } });
    fireEvent.click(botao('Publicar produto'));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/loja/produtos'));
    expect(mocks.createProduct).toHaveBeenCalledWith('token', {
      categoryId: LANCHES.id,
      name: 'X-Burger',
      description: '',
      price: 22,
      status: 'PUBLISHED',
      sizes: [],
      optionGroups: [],
    });
  });

  it('com pendência, publicar fica travado, mas o rascunho salva', async () => {
    mocks.createProduct.mockResolvedValue({ ...NO_AR, status: 'DRAFT' });
    renderizar();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pizza' } });
    expect(screen.getByText('Falta para poder publicar:')).toBeInTheDocument();
    expect(botao('Publicar produto')).toBeDisabled();

    fireEvent.click(botao('Salvar rascunho'));
    await waitFor(() => expect(mocks.createProduct).toHaveBeenCalledTimes(1));
    expect(mocks.createProduct.mock.calls[0]![1]).toMatchObject({
      name: 'Pizza',
      price: null,
      categoryId: null,
      status: 'DRAFT',
    });
  });

  it('não envia o que a API não tem como guardar, e diz o porquê', () => {
    renderizar();
    fireEvent.change(screen.getByLabelText('Preço único'), { target: { value: 'doze' } });
    fireEvent.click(botao('Salvar rascunho'));

    expect(screen.getByRole('alert')).toHaveTextContent('Dê um nome ao produto.');
    expect(screen.getByRole('alert')).toHaveTextContent('Preço: "doze" não é um valor.');
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it('produto no ar que a edição deixa sem venda sai do ar ao salvar — com os mesmos ids', async () => {
    mocks.updateProduct.mockResolvedValue({ ...NO_AR, status: 'DRAFT' });
    renderizar(NO_AR);

    expect(screen.getByLabelText('Preço único')).toHaveValue('22,00');
    fireEvent.click(screen.getByRole('button', { name: 'Remover a escolha Ao ponto' }));
    expect(screen.getByText('Estas alterações tiram o produto do ar:')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();

    fireEvent.click(botao('Salvar e tirar do ar'));
    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct).toHaveBeenCalledWith('token', NO_AR.id, {
      categoryId: LANCHES.id,
      name: 'X-Burger',
      description: 'Pão, carne e queijo',
      price: 22,
      status: 'DRAFT',
      sizes: [],
      optionGroups: [
        {
          id: NO_AR.optionGroups[0]!.id,
          name: 'Ponto da carne',
          minChoices: 1,
          maxChoices: 1,
          options: [],
        },
      ],
    });
  });

  it('passar para tamanhos leva o preço único para o primeiro tamanho', () => {
    renderizar(NO_AR);
    fireEvent.click(botao('Adicionar tamanho'));
    expect(screen.queryByLabelText('Preço único')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Preço do tamanho')).toHaveValue('22,00');
  });

  it('cria a categoria sem sair do formulário, e já a escolhe', async () => {
    const nova = { id: '66666666-6666-4666-8666-666666666666', name: 'Bebidas' };
    mocks.createCategory.mockResolvedValue(nova);
    const queryClient = renderizar();

    fireEvent.click(botao('+ Nova categoria'));
    fireEvent.change(screen.getByLabelText('Nome da nova categoria'), {
      target: { value: 'Bebidas' },
    });
    fireEvent.click(botao('Criar'));

    await waitFor(() =>
      expect(queryClient.getQueryData<StoreCatalog>(CHAVE_DO_CATALOGO)?.categories).toContainEqual(
        nova,
      ),
    );
    expect(mocks.createCategory).toHaveBeenCalledWith('token', { name: 'Bebidas' });
    expect(screen.queryByLabelText('Nome da nova categoria')).not.toBeInTheDocument();
  });

  it('a recusa do servidor aparece escrita', async () => {
    mocks.updateProduct.mockRejectedValue(
      new ApiError(409, {
        message: 'O produto mudou enquanto você editava. Recarregue e tente de novo.',
        code: 'STORE_PRODUCT_STALE',
      }),
    );
    renderizar(NO_AR);
    fireEvent.click(botao('Salvar alterações'));

    expect(
      await screen.findByText('O produto mudou enquanto você editava. Recarregue e tente de novo.'),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('excluir pede confirmação, e só então apaga', async () => {
    mocks.deleteProduct.mockResolvedValue({ deleted: true });
    const queryClient = renderizar(NO_AR);

    fireEvent.click(botao('Excluir produto'));
    expect(mocks.deleteProduct).not.toHaveBeenCalled();
    fireEvent.click(botao('Manter'));
    fireEvent.click(botao('Excluir produto'));
    fireEvent.click(botao('Excluir'));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/loja/produtos'));
    expect(mocks.deleteProduct).toHaveBeenCalledWith('token', NO_AR.id);
    expect(queryClient.getQueryData<StoreCatalog>(CHAVE_DO_CATALOGO)?.products).toEqual([]);
  });
});

describe('Formulário de produto — foto', () => {
  const foto = (tipo = 'image/jpeg', tamanho = 1000) =>
    new File([new Uint8Array(tamanho)], 'foto.jpg', { type: tipo });
  const escolher = (arquivo: File) =>
    fireEvent.change(screen.getByLabelText(/Adicionar foto|Trocar foto/), {
      target: { files: [arquivo] },
    });

  beforeEach(() => {
    window.localStorage.setItem('motoboycity.accessToken', 'token');
    for (const mock of Object.values(mocks)) mock.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:previa');
    URL.revokeObjectURL = vi.fn();
  });

  it('na edição, a foto sobe na hora e aparece no lugar', async () => {
    const comFoto = { ...NO_AR, imageUrl: 'https://ik.imagekit.io/motoboycity/x.jpg' };
    mocks.uploadProductImage.mockResolvedValue(comFoto);
    const queryClient = renderizar(NO_AR);

    const arquivo = foto();
    escolher(arquivo);

    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', comFoto.imageUrl));
    expect(mocks.uploadProductImage).toHaveBeenCalledWith('token', NO_AR.id, arquivo);
    expect(queryClient.getQueryData<StoreCatalog>(CHAVE_DO_CATALOGO)?.products[0]?.imageUrl).toBe(
      comFoto.imageUrl,
    );
    expect(screen.getByLabelText(/Trocar foto/)).toBeInTheDocument();
  });

  it('foto grande demais é recusada antes de subir', () => {
    renderizar(NO_AR);
    escolher(foto('image/jpeg', 6 * 1024 * 1024));

    expect(screen.getByRole('alert')).toHaveTextContent('passa de 5 MB');
    expect(mocks.uploadProductImage).not.toHaveBeenCalled();
  });

  it('remover a foto na edição tira do produto', async () => {
    const comFoto = { ...NO_AR, imageUrl: 'https://ik.imagekit.io/motoboycity/x.jpg' };
    mocks.removeProductImage.mockResolvedValue(NO_AR);
    renderizar(comFoto);

    fireEvent.click(screen.getByRole('button', { name: 'Remover foto' }));

    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
    expect(mocks.removeProductImage).toHaveBeenCalledWith('token', NO_AR.id);
  });

  it('no cadastro, a foto espera o produto existir e sobe logo depois', async () => {
    const criado = { ...NO_AR, optionGroups: [] };
    mocks.createProduct.mockResolvedValue(criado);
    mocks.uploadProductImage.mockResolvedValue({
      ...criado,
      imageUrl: 'https://ik.imagekit.io/y.jpg',
    });
    renderizar();

    const arquivo = foto('image/png');
    escolher(arquivo);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:previa');
    expect(mocks.uploadProductImage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'X-Burger' } });
    fireEvent.click(botao('Salvar rascunho'));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/loja/produtos'));
    expect(mocks.uploadProductImage).toHaveBeenCalledWith('token', criado.id, arquivo);
  });

  it('no cadastro, se só a foto falhar, a edição abre avisando', async () => {
    const criado = { ...NO_AR, optionGroups: [] };
    mocks.createProduct.mockResolvedValue(criado);
    mocks.uploadProductImage.mockRejectedValue(new Error('rede'));
    renderizar();

    escolher(foto());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'X-Burger' } });
    fireEvent.click(botao('Salvar rascunho'));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(`/loja/produtos/${criado.id}/editar?foto=falhou`),
    );
  });
});

describe('Formulário de produto — estoque opcional', () => {
  beforeEach(() => {
    window.localStorage.setItem('motoboycity/accessToken', 'token');
    window.localStorage.setItem('motoboycity.accessToken', 'token');
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it('o campo existe, vazio e opcional, e explica o que o estoque faz', () => {
    renderizar();

    expect(screen.getByLabelText('Unidades em estoque')).toHaveValue('');
    expect(screen.getByLabelText('Unidades em estoque')).toHaveAttribute(
      'placeholder',
      'Sem controle',
    );
    expect(screen.getByText(/Deixe vazio para não controlar/)).toBeInTheDocument();
  });

  it('cadastra com estoque: o número vai na chamada', async () => {
    mocks.createProduct.mockResolvedValue({ ...NO_AR, optionGroups: [], stock: 12 });
    renderizar();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'X-Burger' } });
    fireEvent.change(screen.getByLabelText('Preço único'), { target: { value: '22,00' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: LANCHES.id } });
    fireEvent.change(screen.getByLabelText('Unidades em estoque'), { target: { value: '12' } });
    fireEvent.click(botao('Publicar produto'));

    await waitFor(() => expect(mocks.createProduct).toHaveBeenCalledTimes(1));
    expect(mocks.createProduct.mock.calls[0]![1]).toMatchObject({ stock: 12 });
  });

  it('na edição o campo abre com o estoque, e salvar sem mexer nele não o manda', async () => {
    mocks.updateProduct.mockResolvedValue({ ...NO_AR, stock: 12 });
    renderizar({ ...NO_AR, stock: 12 });

    expect(screen.getByLabelText('Unidades em estoque')).toHaveValue('12');
    // Só o preço muda.
    fireEvent.change(screen.getByLabelText('Preço único'), { target: { value: '24,00' } });
    fireEvent.click(botao('Salvar alterações'));

    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1));
    const corpo = mocks.updateProduct.mock.calls[0]![2];
    expect(corpo).toMatchObject({ price: 24 });
    expect(corpo).not.toHaveProperty('stock');
  });

  it('trocar o número repõe o estoque', async () => {
    mocks.updateProduct.mockResolvedValue({ ...NO_AR, stock: 30 });
    renderizar({ ...NO_AR, stock: 12 });

    fireEvent.change(screen.getByLabelText('Unidades em estoque'), { target: { value: '30' } });
    fireEvent.click(botao('Salvar alterações'));

    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct.mock.calls[0]![2]).toMatchObject({ stock: 30 });
  });

  it('apagar o campo tira o controle de estoque', async () => {
    mocks.updateProduct.mockResolvedValue({ ...NO_AR, stock: null });
    renderizar({ ...NO_AR, stock: 12 });

    fireEvent.change(screen.getByLabelText('Unidades em estoque'), { target: { value: '' } });
    fireEvent.click(botao('Salvar alterações'));

    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct.mock.calls[0]![2]).toMatchObject({ stock: null });
  });

  it('com tamanhos, avisa que eles dividem o mesmo estoque', () => {
    renderizar({
      ...NO_AR,
      price: null,
      sizes: [
        { id: '66666666-6666-4666-8666-666666666661', name: 'Grande', price: 30, available: true },
      ],
    });

    expect(screen.getByText(/Os tamanhos dividem o mesmo estoque/)).toBeInTheDocument();
  });

  it('um estoque que não é número impede salvar, com o motivo na tela', () => {
    renderizar(NO_AR);

    fireEvent.change(screen.getByLabelText('Unidades em estoque'), { target: { value: 'muitas' } });
    fireEvent.click(botao('Salvar alterações'));

    expect(screen.getByText(/Estoque: "muitas" não é um número inteiro/)).toBeInTheDocument();
    expect(mocks.updateProduct).not.toHaveBeenCalled();
  });
});

describe('Formulário de combo', () => {
  const HAMBURGUER: StoreProduct = {
    ...NO_AR,
    id: '88888888-8888-4888-8888-888888888881',
    name: 'X-Burger',
    price: 22,
    optionGroups: [],
  };
  const BATATA: StoreProduct = {
    ...HAMBURGUER,
    id: '88888888-8888-4888-8888-888888888882',
    name: 'Batata',
    price: null,
    sizes: [
      { id: '99999999-9999-4999-8999-999999999991', name: 'Média', price: 12, available: true },
      { id: '99999999-9999-4999-8999-999999999992', name: 'Grande', price: 16, available: true },
    ],
  };
  const COM_ESCOLHAS = { ...NO_AR, id: '88888888-8888-4888-8888-888888888883', name: 'Pizza' };
  const COMBO_SALVO: StoreProduct = {
    ...HAMBURGUER,
    id: '88888888-8888-4888-8888-888888888890',
    kind: 'COMBO',
    name: 'Combo Clássico',
    price: 30,
    comboItems: [
      { productId: HAMBURGUER.id, sizeId: null, quantity: 1 },
      { productId: BATATA.id, sizeId: BATATA.sizes[1]!.id, quantity: 2 },
    ],
  };

  function renderizarCombo(
    produto?: StoreProduct,
    produtos: StoreProduct[] = [HAMBURGUER, BATATA],
  ) {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData<StoreCatalog>(CHAVE_DO_CATALOGO, {
      categories: [LANCHES],
      products: produto ? [...produtos, produto] : produtos,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <FormularioDeProduto
          produto={produto}
          categorias={[LANCHES]}
          produtos={produto ? [...produtos, produto] : produtos}
          tipo="COMBO"
        />
      </QueryClientProvider>,
    );
  }
  const linhaDoCombo = (indice: number) => ({
    produto: screen.getAllByLabelText('Produto do combo')[indice]!,
    quantidade: screen.getAllByLabelText('Quantidade no combo')[indice]!,
  });

  beforeEach(() => {
    window.localStorage.setItem('motoboycity.accessToken', 'token');
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it('o cadastro de combo tem a composição e o preço do combo, e não tem tamanhos nem estoque', () => {
    renderizarCombo();

    expect(screen.getByRole('heading', { name: 'Cadastrar combo' })).toBeInTheDocument();
    expect(screen.getByText('O que vem no combo')).toBeInTheDocument();
    expect(screen.getByLabelText('Preço do combo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Unidades em estoque')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adicionar tamanho/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Preço único')).not.toBeInTheDocument();
    expect(botao('Publicar combo')).toBeDisabled();
    expect(screen.getByText(/sem itens/)).toBeInTheDocument();
  });

  it('monta e publica o combo: os itens, a economia à vista, e o que a API recebe', async () => {
    mocks.createProduct.mockResolvedValue(COMBO_SALVO);
    renderizarCombo();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Combo Clássico' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: LANCHES.id } });
    fireEvent.click(botao('Adicionar produto'));
    fireEvent.change(linhaDoCombo(0).produto, { target: { value: HAMBURGUER.id } });
    fireEvent.click(botao('Adicionar produto'));
    fireEvent.change(linhaDoCombo(1).produto, { target: { value: BATATA.id } });
    fireEvent.change(linhaDoCombo(1).quantidade, { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Preço do combo'), { target: { value: '30,00' } });

    // A batata nasce no primeiro tamanho (Média, R$ 12,00): 22 + 2 x 12 = 46.
    expect(screen.getByLabelText('Tamanho no combo')).toHaveValue(BATATA.sizes[0]!.id);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Comprados separados, os itens custam R$ 46,00.',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'O cliente economiza R$ 16,00 (35%) no combo.',
    );

    fireEvent.click(botao('Publicar combo'));
    await waitFor(() => expect(mocks.createProduct).toHaveBeenCalledTimes(1));
    expect(mocks.createProduct.mock.calls[0]![1]).toEqual({
      kind: 'COMBO',
      comboItems: [
        { productId: HAMBURGUER.id, sizeId: null, quantity: 1 },
        { productId: BATATA.id, sizeId: BATATA.sizes[0]!.id, quantity: 2 },
      ],
      categoryId: LANCHES.id,
      name: 'Combo Clássico',
      description: '',
      price: 30,
      status: 'PUBLISHED',
      sizes: [],
      optionGroups: [],
    });
  });

  it('trocar o tamanho muda a conta; preço igual ou acima dos itens separados avisa que não há vantagem', () => {
    renderizarCombo();
    fireEvent.click(botao('Adicionar produto'));
    fireEvent.change(linhaDoCombo(0).produto, { target: { value: BATATA.id } });
    fireEvent.change(screen.getByLabelText('Tamanho no combo'), {
      target: { value: BATATA.sizes[1]!.id },
    });
    fireEvent.change(screen.getByLabelText('Preço do combo'), { target: { value: '16,00' } });

    expect(screen.getByRole('status')).toHaveTextContent('os itens custam R$ 16,00');
    expect(screen.getByRole('status')).toHaveTextContent('não vê vantagem');
    expect(screen.getByRole('status')).not.toHaveTextContent('economiza');
  });

  it('o combo e o produto que exige escolhas não podem ser escolhidos, e o produto pausado avisa', () => {
    const pausado = {
      ...HAMBURGUER,
      id: '88888888-8888-4888-8888-888888888884',
      name: 'Sanduíche',
      status: 'PAUSED' as const,
    };
    renderizarCombo(COMBO_SALVO, [HAMBURGUER, BATATA, COM_ESCOLHAS, pausado]);
    fireEvent.click(botao('Adicionar produto'));
    const opcoes = Array.from(linhaDoCombo(2).produto.querySelectorAll('option'));
    const texto = (nome: string) => opcoes.find((opcao) => opcao.textContent?.startsWith(nome));

    expect(texto('Pizza')).toHaveTextContent('Pizza — exige escolhas');
    expect(texto('Pizza')).toBeDisabled();
    expect(texto('Sanduíche')).toHaveTextContent('Sanduíche (pausado)');
    expect(texto('Sanduíche')).toBeEnabled();
    // O próprio combo não é oferecido como item.
    expect(opcoes.some((opcao) => opcao.textContent?.includes('Combo Clássico'))).toBe(false);
  });

  it('o combo salvo abre com os itens, e salvar sem mexer manda os mesmos itens', async () => {
    mocks.updateProduct.mockResolvedValue(COMBO_SALVO);
    renderizarCombo(COMBO_SALVO);

    expect(screen.getByRole('heading', { name: 'Editar combo' })).toBeInTheDocument();
    expect(linhaDoCombo(0).produto).toHaveValue(HAMBURGUER.id);
    expect(linhaDoCombo(1).produto).toHaveValue(BATATA.id);
    expect(linhaDoCombo(1).quantidade).toHaveValue('2');
    expect(screen.getByLabelText('Tamanho no combo')).toHaveValue(BATATA.sizes[1]!.id);

    fireEvent.click(botao('Salvar alterações'));
    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct.mock.calls[0]![2]).toMatchObject({
      kind: 'COMBO',
      comboItems: [
        { productId: HAMBURGUER.id, sizeId: null, quantity: 1 },
        { productId: BATATA.id, sizeId: BATATA.sizes[1]!.id, quantity: 2 },
      ],
    });
  });

  it('um item pausado tira o combo do ar: o formulário diz qual, e o botão vira "Salvar e tirar do ar"', () => {
    renderizarCombo(COMBO_SALVO, [{ ...HAMBURGUER, status: 'PAUSED' }, BATATA]);

    expect(screen.getByText('Estas alterações tiram o combo do ar:')).toBeInTheDocument();
    expect(screen.getByText(/"X-Burger" está pausado/)).toBeInTheDocument();
    expect(botao('Salvar e tirar do ar')).toBeEnabled();
  });

  it('tirar um item da lista tira da conta', () => {
    renderizarCombo(COMBO_SALVO);

    fireEvent.click(screen.getByRole('button', { name: 'Tirar X-Burger do combo' }));

    expect(screen.getAllByLabelText('Produto do combo')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('os itens custam R$ 32,00');
  });

  it('excluir um produto que está em combos avisa quais saem do ar', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<StoreCatalog>(CHAVE_DO_CATALOGO, {
      categories: [LANCHES],
      products: [HAMBURGUER, BATATA, COMBO_SALVO],
    });
    render(
      <QueryClientProvider client={queryClient}>
        <FormularioDeProduto
          produto={HAMBURGUER}
          categorias={[LANCHES]}
          produtos={[HAMBURGUER, BATATA, COMBO_SALVO]}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(botao('Excluir produto'));

    expect(screen.getByText(/Ele está no combo/)).toHaveTextContent(
      'Ele está no combo Combo Clássico, que sai do ar até você trocar o item.',
    );
  });

  it('o produto comum segue sem nada de combo', () => {
    renderizar(NO_AR);

    expect(screen.queryByText('O que vem no combo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Preço único')).toBeInTheDocument();
    expect(screen.getByLabelText('Unidades em estoque')).toBeInTheDocument();
  });
});
