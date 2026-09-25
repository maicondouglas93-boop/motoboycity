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
