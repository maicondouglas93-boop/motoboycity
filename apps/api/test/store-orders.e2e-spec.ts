import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PedidoDaLoja, PublicStoreLookup, StoreProduct } from '@motoboycity/types';
import { AppModule } from '../src/app.module';
import { VerificadorDoCliente } from '../src/company/store-orders/cliente-da-loja.guard';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * O pedido da página da loja, contra o banco de verdade: o cliente logado faz o
 * pedido, o servidor calcula o preço e numera, e cada cliente vê só os dele.
 * O Clerk é simulado: "cliente-a" e "cliente-b" são dois tokens válidos.
 */

const suffix = String(Date.now()).slice(-8);
const password = 'senhaSegura123';
const empresa = {
  email: `pedido.${suffix}@example.com`,
  document: `502${suffix}`.slice(0, 11),
  tradeName: 'Pedido E2E',
};
const link = `pedido-${suffix}`;

/** O dia inteiro, todo dia: o teste não depende da hora em que roda. */
const SEMPRE_ABERTA = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  faixas: [{ abre: '00:00', fecha: '00:00' }],
}));

describe('Pedido da loja online (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';
  let regiaoCriada: string | null = null;

  const comoEmpresa = () => ({ Authorization: `Bearer ${token}` });
  const comoCliente = (quem: string) => ({ Authorization: `Bearer ${quem}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VerificadorDoCliente)
      .useValue({
        disponivel: () => true,
        verificar: (recebido: string) =>
          Promise.resolve(
            recebido === 'cliente-a' ? 'user_a' : recebido === 'cliente-b' ? 'user_b' : null,
          ),
      })
      .compile();
    app = module.createNestApplication();
    prisma = module.get(PrismaService);
    await app.init();

    if (!(await prisma.region.findFirst({ where: { active: true } }))) {
      regiaoCriada = (await prisma.region.create({ data: { name: `Região E2E ${suffix}` } })).id;
    }
    await request(app.getHttpServer())
      .post('/auth/register/company')
      .send({
        name: empresa.tradeName,
        email: empresa.email,
        phone: '33999887766',
        document: empresa.document,
        legalName: `${empresa.tradeName} LTDA`,
        tradeName: empresa.tradeName,
        password,
      });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: empresa.email, password });
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: empresa.email } } });
    // Pedidos, cardápio, operação e link saem junto com a empresa, em cascata.
    await prisma.company.deleteMany({ where: { document: empresa.document } });
    await prisma.user.deleteMany({ where: { email: empresa.email } });
    if (regiaoCriada) await prisma.region.delete({ where: { id: regiaoCriada } });
    await app.close();
  });

  it('o cliente pede, o servidor calcula e numera, e cada um vê os seus', async () => {
    const servidor = app.getHttpServer();

    // A loja: link, um produto publicado, horário, bairro e pagamento.
    await request(servidor)
      .put('/company/store/settings/link')
      .set(comoEmpresa())
      .send({ slug: link, name: 'Pedido' })
      .expect(200);
    const secao = await request(servidor)
      .post('/company/store/categories')
      .set(comoEmpresa())
      .send({ name: 'Lanches' })
      .expect(201);
    const lanche = await request(servidor)
      .post('/company/store/products')
      .set(comoEmpresa())
      .send({
        categoryId: secao.body.id,
        name: 'X-Burger',
        description: '',
        price: 22.5,
        status: 'PUBLISHED',
        sizes: [],
        optionGroups: [],
      })
      .expect(201);
    const produto = lanche.body as StoreProduct;
    await request(servidor)
      .put('/company/store/operation/schedule')
      .set(comoEmpresa())
      .send({ semana: SEMPRE_ABERTA, excecoes: [], mensagemFechada: '' })
      .expect(200);
    await request(servidor)
      .put('/company/store/operation/delivery-areas')
      .set(comoEmpresa())
      .send({ bairros: [{ id: 'b1', nome: 'Centro', taxa: 5 }] })
      .expect(200);
    await prisma.company.update({
      where: { document: empresa.document },
      data: { status: 'ACTIVE' },
    });

    const novoPedido = {
      modalidade: 'ENTREGA',
      itens: [{ produtoId: produto.id, tamanhoId: null, escolhas: [], quantidade: 2 }],
      agendadoPara: null,
      cliente: { nome: 'Ana', telefone: '(33) 99988-7766' },
      entrega: {
        rua: 'Rua A',
        numero: '10',
        complemento: null,
        bairroId: 'b1',
        cidade: 'Lajinha',
        estado: 'MG',
        cep: '',
        referencia: null,
      },
      pagamento: 'DINHEIRO',
      trocoPara: 100,
      observacao: 'Sem cebola',
      totalVisto: 50,
    };

    // Sem conta, não pede; loja que não ligou os pedidos, também não.
    await request(servidor).post(`/public/stores/${link}/orders`).send(novoPedido).expect(401);
    const desligada = await request(servidor)
      .post(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-a'))
      .send(novoPedido)
      .expect(409);
    expect(desligada.body.code).toBe('STORE_NOT_ACCEPTING_ORDERS');

    await request(servidor)
      .put('/company/store/settings/accepts-orders')
      .set(comoEmpresa())
      .send({ recebePedidos: true })
      .expect(200);
    const vitrine = await request(servidor).get(`/public/stores/${link}`).expect(200);
    expect(
      (vitrine.body as Extract<PublicStoreLookup, { kind: 'store' }>).store.recebePedidos,
    ).toBe(true);

    const primeiro = await request(servidor)
      .post(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-a'))
      .send(novoPedido)
      .expect(201);
    expect(primeiro.body as PedidoDaLoja).toMatchObject({
      numero: 1,
      etapa: 'ACEITO',
      subtotal: 45,
      taxaDeEntrega: 5,
      total: 50,
      trocoPara: 100,
      cliente: { nome: 'Ana', telefone: '33999887766' },
      entrega: { bairro: 'Centro' },
      observacao: 'Sem cebola',
    });

    // O preço mudou no painel com a sacola aberta: o total visto não vale mais.
    await prisma.storeProduct.update({ where: { id: produto.id }, data: { price: 25 } });
    const mudou = await request(servidor)
      .post(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-b'))
      .send(novoPedido)
      .expect(409);
    expect(mudou.body).toMatchObject({ code: 'STORE_ORDER_TOTAL_CHANGED', total: 55 });

    const segundo = await request(servidor)
      .post(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-b'))
      .send({ ...novoPedido, totalVisto: 55 })
      .expect(201);
    expect((segundo.body as PedidoDaLoja).numero).toBe(2);

    const deA = await request(servidor)
      .get(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-a'))
      .expect(200);
    expect((deA.body as PedidoDaLoja[]).map((pedido) => pedido.numero)).toEqual([1]);
    const deB = await request(servidor)
      .get(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-b'))
      .expect(200);
    expect((deB.body as PedidoDaLoja[]).map((pedido) => pedido.numero)).toEqual([2]);

    // A loja: a fila de Vendas, e o pedido andando.
    const fila = await request(servidor)
      .get('/company/store/orders')
      .set(comoEmpresa())
      .expect(200);
    const doisPedidos = fila.body as PedidoDaLoja[];
    expect(doisPedidos.map((pedido) => pedido.numero)).toEqual([2, 1]);
    const primeiroPedido = doisPedidos[1]!;

    const emPreparo = await request(servidor)
      .put(`/company/store/orders/${primeiroPedido.id}/stage`)
      .set(comoEmpresa())
      .send({ para: 'EM_PREPARO' })
      .expect(200);
    expect((emPreparo.body as PedidoDaLoja).etapa).toBe('EM_PREPARO');
    // Pular etapa é recusado.
    await request(servidor)
      .put(`/company/store/orders/${primeiroPedido.id}/stage`)
      .set(comoEmpresa())
      .send({ para: 'ENTREGUE' })
      .expect(409);
    const cancelado = await request(servidor)
      .post(`/company/store/orders/${doisPedidos[0]!.id}/cancel`)
      .set(comoEmpresa())
      .send({ motivo: 'Item em falta' })
      .expect(201);
    expect(cancelado.body as PedidoDaLoja).toMatchObject({
      etapa: 'CANCELADO',
      cancelamento: { motivo: 'Item em falta', por: 'LOJA' },
    });

    // O cliente vê o cancelamento, com o motivo.
    const vistoPorB = await request(servidor)
      .get(`/public/stores/${link}/orders`)
      .set(comoCliente('cliente-b'))
      .expect(200);
    expect((vistoPorB.body as PedidoDaLoja[])[0]!.etapa).toBe('CANCELADO');
  });
});
