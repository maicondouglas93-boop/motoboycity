import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { storeSlugSchema, suggestStoreSlug } from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreSettingsService } from './store-settings.service';

const EMPRESA = 'empresa-1';
const OUTRA = 'empresa-2';
const membro = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;

describe('StoreSettingsService', () => {
  let service: StoreSettingsService;
  let catalogo: { resolveCompanyId: jest.Mock; publicCatalog: jest.Mock };
  let prisma: {
    storeSettings: { findUnique: jest.Mock; upsert: jest.Mock };
    storeSlug: { findUnique: jest.Mock; create: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    catalogo = {
      resolveCompanyId: jest.fn().mockResolvedValue(EMPRESA),
      publicCatalog: jest.fn().mockResolvedValue({ categories: [], products: [] }),
    };
    prisma = {
      storeSettings: { findUnique: jest.fn(), upsert: jest.fn() },
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
      });
    });

    it('link novo passa a ser da loja', async () => {
      prisma.storeSlug.findUnique.mockResolvedValue(null);
      prisma.storeSettings.upsert.mockResolvedValue({ slug: 'acai-do-centro', name: 'Açaí' });

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
      prisma.storeSettings.upsert.mockResolvedValue({ slug: 'acai', name: 'Açaí' });

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

  describe('loja pelo link', () => {
    const linkDe = (companyStatus: string, atual: string) => ({
      company: {
        id: EMPRESA,
        status: companyStatus,
        storeSettings: { slug: atual, name: 'Açaí do Centro' },
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

      await expect(service.publicStore('acai')).resolves.toEqual({
        kind: 'store',
        store: { slug: 'acai', name: 'Açaí do Centro', ...cardapio },
      });
      expect(catalogo.publicCatalog).toHaveBeenCalledWith(EMPRESA);
    });
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
