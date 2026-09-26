import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  storeSlugSchema,
  suggestStoreSlug,
  updateStoreIdentitySchema,
} from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { ImageKitService } from '../../media/imagekit.service';
import type { UploadedImageFile } from '../../media/supported-image';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import {
  OPERACAO_INICIAL,
  StoreOperationService,
} from '../store-operation/store-operation.service';
import { IDENTIDADE_PADRAO, StoreSettingsService } from './store-settings.service';

const EMPRESA = 'empresa-1';
const OUTRA = 'empresa-2';
const membro = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;

/** A linha gravada da loja, com a identidade padrão. */
function lojaGravada(mudancas: Record<string, unknown> = {}) {
  return {
    companyId: EMPRESA,
    slug: 'acai',
    name: 'Açaí do Centro',
    theme: 'CLARO',
    brandColor: '#c2410c',
    actionColor: '#15803d',
    logoUrl: null,
    logoExternalFileId: null,
    acceptsOrders: false,
    createdAt: new Date('2026-09-25T10:00:00Z'),
    updatedAt: new Date('2026-09-25T10:00:00Z'),
    ...mudancas,
  };
}

/** Um JPEG mínimo de 1 x 1: a checagem do arquivo olha o conteúdo, e não o nome. */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff,
  0xd9,
]);
const logoJpeg = {
  buffer: JPEG,
  size: JPEG.length,
  mimetype: 'image/jpeg',
  originalname: 'logo.jpg',
} as UploadedImageFile;

describe('StoreSettingsService', () => {
  let service: StoreSettingsService;
  let catalogo: { resolveCompanyId: jest.Mock; publicCatalog: jest.Mock };
  let operacao: { publicOperation: jest.Mock };
  let imageKit: { uploadStoreLogo: jest.Mock; delete: jest.Mock };
  let prisma: {
    storeSettings: { findUnique: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
    storeSlug: { findUnique: jest.Mock; create: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    catalogo = {
      resolveCompanyId: jest.fn().mockResolvedValue(EMPRESA),
      publicCatalog: jest.fn().mockResolvedValue({ categories: [], products: [] }),
    };
    const { notificacoes: _avisos, ...publica } = OPERACAO_INICIAL;
    operacao = { publicOperation: jest.fn().mockResolvedValue(publica) };
    imageKit = {
      uploadStoreLogo: jest.fn().mockResolvedValue({
        externalFileId: 'logo-nova',
        url: 'https://ik.imagekit.io/x/logo.png',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      storeSettings: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      storeSlug: { findUnique: jest.fn(), create: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ tradeName: 'Açaí do Centro' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreSettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StoreCatalogService, useValue: catalogo },
        { provide: StoreOperationService, useValue: operacao },
        { provide: ImageKitService, useValue: imageKit },
      ],
    }).compile();
    service = module.get(StoreSettingsService);
  });

  describe('link no painel', () => {
    it('sem loja ainda, sugere o link pelo nome fantasia', async () => {
      prisma.storeSettings.findUnique.mockResolvedValue(null);
      await expect(service.settings(membro)).resolves.toEqual({
        slug: null,
        name: 'Açaí do Centro',
        suggestedSlug: 'acai-do-centro',
        identity: IDENTIDADE_PADRAO,
        recebePedidos: false,
      });
    });

    it('link novo passa a ser da loja', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue(null);
      prisma.storeSettings.upsert.mockResolvedValue(
        lojaGravada({ slug: 'acai-do-centro', name: 'Açaí' }),
      );

      await service.updateLink(membro, { slug: 'acai-do-centro', name: 'Açaí' });

      expect(prisma.storeSlug.create).toHaveBeenCalledWith({
        data: { slug: 'acai-do-centro', companyId: EMPRESA },
      });
      expect(prisma.storeSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: EMPRESA } }),
      );
    });

    it('link que já é, ou já foi, de outra loja é recusado', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue({ slug: 'acai', companyId: OUTRA });

      await expect(
        service.updateLink(membro, { slug: 'acai', name: 'Açaí' }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'STORE_SLUG_TAKEN' }) });
      expect(prisma.storeSettings.upsert).not.toHaveBeenCalled();
    });

    it('voltar a um link que já foi seu reaproveita o mesmo', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue({ slug: 'acai', companyId: EMPRESA });
      prisma.storeSettings.upsert.mockResolvedValue(lojaGravada({ name: 'Açaí' }));

      await service.updateLink(membro, { slug: 'acai', name: 'Açaí' });

      expect(prisma.storeSlug.create).not.toHaveBeenCalled();
    });

    it('duas lojas pedindo o mesmo link ao mesmo tempo: a segunda ouve que já é de outra', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue(null);
      prisma.storeSlug.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.updateLink(membro, { slug: 'acai', name: 'Açaí' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('pedidos pela página', () => {
    it('liga os pedidos da loja; sem link, não há o que ligar', async () => {
      prisma.storeSettings.findUnique.mockResolvedValue(lojaGravada({ acceptsOrders: true }));
      const ligada = await service.updateAcceptsOrders(membro, true);
      expect(prisma.storeSettings.updateMany).toHaveBeenCalledWith({
        where: { companyId: EMPRESA },
        data: { acceptsOrders: true },
      });
      expect(ligada.recebePedidos).toBe(true);

      prisma.storeSettings.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.updateAcceptsOrders(membro, true)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STORE_LINK_REQUIRED' }),
      });
    });
  });

  describe('identidade visual', () => {
    const cores = { theme: 'ESCURO' as const, brandColor: '#fbbf24', actionColor: '#22c55e' };

    it('grava o tema e as cores da loja', async () => {
      prisma.storeSettings.findUnique.mockResolvedValue(lojaGravada(cores));

      const salva = await service.updateIdentity(membro, cores);

      expect(prisma.storeSettings.updateMany).toHaveBeenCalledWith({
        where: { companyId: EMPRESA },
        data: cores,
      });
      expect(salva.identity).toEqual({ ...cores, logoUrl: null });
    });

    it('sem link, não há loja para vestir', async () => {
      prisma.storeSettings.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.updateIdentity(membro, cores)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STORE_LINK_REQUIRED' }),
      });
    });

    it('a logo nova entra, e a anterior sai do ImageKit depois de gravada', async () => {
      prisma.storeSettings.findUnique
        .mockResolvedValueOnce(lojaGravada({ logoExternalFileId: 'logo-velha' }))
        .mockResolvedValueOnce({ logoExternalFileId: 'logo-velha' })
        .mockResolvedValue(lojaGravada({ logoUrl: 'https://ik.imagekit.io/x/logo.png' }));

      const salva = await service.setLogo(membro, logoJpeg);

      expect(imageKit.uploadStoreLogo).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: EMPRESA, extension: 'jpg' }),
      );
      expect(prisma.storeSettings.updateMany).toHaveBeenCalledWith({
        where: { companyId: EMPRESA, logoExternalFileId: 'logo-velha' },
        data: { logoUrl: 'https://ik.imagekit.io/x/logo.png', logoExternalFileId: 'logo-nova' },
      });
      expect(imageKit.delete).toHaveBeenCalledWith('logo-velha');
      expect(salva.identity.logoUrl).toBe('https://ik.imagekit.io/x/logo.png');
    });

    it('sem link, a logo nem sobe', async () => {
      prisma.storeSettings.findUnique.mockResolvedValue(null);
      await expect(service.setLogo(membro, logoJpeg)).rejects.toBeInstanceOf(ConflictException);
      expect(imageKit.uploadStoreLogo).not.toHaveBeenCalled();
    });

    it('se a gravação falha, quem sai do ImageKit é a logo que acabou de subir', async () => {
      prisma.storeSettings.findUnique
        .mockResolvedValueOnce(lojaGravada())
        .mockResolvedValue({ logoExternalFileId: null });
      prisma.storeSettings.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.setLogo(membro, logoJpeg)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STORE_LOGO_STALE' }),
      });
      expect(imageKit.delete).toHaveBeenCalledWith('logo-nova');
    });

    it('tirar a logo apaga o arquivo; tirar de quem não tem não é erro', async () => {
      prisma.storeSettings.findUnique
        .mockResolvedValueOnce(lojaGravada({ logoExternalFileId: 'logo-velha' }))
        .mockResolvedValueOnce({ logoExternalFileId: 'logo-velha' })
        .mockResolvedValueOnce(lojaGravada())
        .mockResolvedValueOnce(lojaGravada())
        .mockResolvedValueOnce({ logoExternalFileId: null })
        .mockResolvedValue(lojaGravada());

      await service.removeLogo(membro);
      expect(imageKit.delete).toHaveBeenCalledWith('logo-velha');

      imageKit.delete.mockClear();
      await service.removeLogo(membro);
      expect(imageKit.delete).not.toHaveBeenCalled();
    });
  });

  describe('loja pelo link', () => {
    const linkDe = (companyStatus: string, atual: string) => ({
      company: {
        id: EMPRESA,
        status: companyStatus,
        storeSettings: {
          slug: atual,
          name: 'Açaí do Centro',
          theme: 'ESCURO',
          brandColor: '#fbbf24',
          actionColor: '#22c55e',
          logoUrl: 'https://ik.imagekit.io/x/logo.png',
          acceptsOrders: false,
        },
        addresses: [
          {
            street: 'Rua da Empresa',
            number: '12',
            complement: null,
            city: 'Lajinha',
            state: 'MG',
          },
        ],
      },
    });

    it('link que não existe responde que a loja não existe', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue(null);
      await expect(service.publicStore('nada')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('empresa esperando aprovação, ou suspensa, não aparece para o público', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue(linkDe('PENDING_APPROVAL', 'acai'));
      await expect(service.publicStore('acai')).rejects.toBeInstanceOf(NotFoundException);
      prisma.storeSlug.findUnique.mockResolvedValue(linkDe('SUSPENDED', 'acai'));
      await expect(service.publicStore('acai')).rejects.toBeInstanceOf(NotFoundException);
      expect(catalogo.publicCatalog).not.toHaveBeenCalled();
    });

    it('link antigo aponta para o atual', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue(linkDe('ACTIVE', 'acai-do-centro'));
      await expect(service.publicStore('acai')).resolves.toEqual({
        kind: 'moved',
        slug: 'acai-do-centro',
      });
      expect(catalogo.publicCatalog).not.toHaveBeenCalled();
    });

    it('link atual abre a loja com o cardápio público', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue(linkDe('ACTIVE', 'acai'));
      const cardapio = { categories: [{ id: 'c', name: 'Açaí' }], products: [] };
      catalogo.publicCatalog.mockResolvedValue(cardapio);

      const resposta = await service.publicStore('acai');

      expect(resposta).toMatchObject({
        kind: 'store',
        store: {
          slug: 'acai',
          name: 'Açaí do Centro',
          identity: {
            theme: 'ESCURO',
            brandColor: '#fbbf24',
            actionColor: '#22c55e',
            logoUrl: 'https://ik.imagekit.io/x/logo.png',
          },
          ...cardapio,
        },
      });
      expect(catalogo.publicCatalog).toHaveBeenCalledWith(EMPRESA);
      // O horário e os tipos de pedido vão junto; os avisos da loja, não.
      expect(operacao.publicOperation).toHaveBeenCalledWith(EMPRESA);
      if (resposta.kind === 'store') {
        expect(resposta.store.operacao).toHaveProperty('funcionamento');
        expect(resposta.store.operacao).not.toHaveProperty('notificacoes');
        // Pedido pela página só com a loja ligando; a retirada padrão é a da empresa.
        expect(resposta.store.recebePedidos).toBe(false);
        expect(resposta.store.enderecoDeRetirada).toEqual({
          rua: 'Rua da Empresa',
          numero: '12',
          complemento: null,
          bairro: '',
          cidade: 'Lajinha',
          estado: 'MG',
        });
      }
    });
  });
});

describe('regras da identidade', () => {
  it('a cor vai para minúsculas, e o formato é #rrggbb', () => {
    expect(
      updateStoreIdentitySchema.parse({
        theme: 'CLARO',
        brandColor: '#C2410C',
        actionColor: '#15803d',
      }),
    ).toEqual({ theme: 'CLARO', brandColor: '#c2410c', actionColor: '#15803d' });
    expect(
      updateStoreIdentitySchema.safeParse({
        theme: 'CLARO',
        brandColor: 'laranja',
        actionColor: '#15803d',
      }).success,
    ).toBe(false);
  });

  it('cor que some contra o fundo é recusada, com a mesma frase do painel', () => {
    const amareloNoClaro = updateStoreIdentitySchema.safeParse({
      theme: 'CLARO',
      brandColor: '#facc15',
      actionColor: '#15803d',
    });
    expect(amareloNoClaro.success).toBe(false);
    expect(amareloNoClaro.error?.issues[0]).toMatchObject({
      path: ['brandColor'],
      message: expect.stringContaining('Escolha um tom mais escuro'),
    });
    // O mesmo amarelo passa no tema escuro: a régua é o fundo da loja.
    expect(
      updateStoreIdentitySchema.safeParse({
        theme: 'ESCURO',
        brandColor: '#facc15',
        actionColor: '#22c55e',
      }).success,
    ).toBe(true);
  });
});

describe('regras do link', () => {
  it('sugere pelo nome, sem acento nem espaço', () => {
    expect(suggestStoreSlug('Açaí do Centro')).toBe('acai-do-centro');
    expect(suggestStoreSlug('  Pizzaria  Dom  Pepe!! ')).toBe('pizzaria-dom-pepe');
    expect(suggestStoreSlug('BK')).toBe('bk-loja');
    expect(suggestStoreSlug('Loja')).toBe('loja-oficial');
    expect(suggestStoreSlug('!!!')).toBe('');
  });

  it('aceita endereço de verdade, em minúsculas, e recusa o resto', () => {
    expect(storeSlugSchema.parse(' Acai-Do-Centro ')).toBe('acai-do-centro');
    expect(storeSlugSchema.safeParse('ac').success).toBe(false);
    expect(storeSlugSchema.safeParse('açaí').success).toBe(false);
    expect(storeSlugSchema.safeParse('acai do centro').success).toBe(false);
    expect(storeSlugSchema.safeParse('-acai').success).toBe(false);
    expect(storeSlugSchema.safeParse('acai--centro').success).toBe(false);
    expect(storeSlugSchema.safeParse('minha-loja').success).toBe(false);
    expect(storeSlugSchema.safeParse('admin').success).toBe(false);
  });
});
