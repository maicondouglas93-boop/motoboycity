import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicStoreLookup, StoreSettings } from '@motoboycity/types';
import { suggestStoreSlug, type UpdateStoreLinkPayload } from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';

/**
 * O link da loja online, e a loja que um link abre.
 *
 * Todo link que uma loja usa fica guardado em `store_slugs`, com a própria loja
 * como dona. Trocar de link não libera o antigo: ele continua dela e passa a
 * apontar para o atual — o panfleto e o QR impressos não morrem, e nunca abrem
 * a loja de outra pessoa.
 */
@Injectable()
export class StoreSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: StoreCatalogService,
  ) {}

  async settings(user: User): Promise<StoreSettings> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const [loja, empresa] = await Promise.all([
      this.prisma.storeSettings.findUnique({ where: { companyId } }),
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { tradeName: true },
      }),
    ]);
    if (loja) return { slug: loja.slug, name: loja.name, suggestedSlug: loja.slug };
    return {
      slug: null,
      name: empresa.tradeName,
      suggestedSlug: suggestStoreSlug(empresa.tradeName),
    };
  }

  async updateLink(user: User, payload: UpdateStoreLinkPayload): Promise<StoreSettings> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const jaUsado = () =>
      new ConflictException({
        message: 'Este link já é de outra loja. Escolha outro.',
        code: 'STORE_SLUG_TAKEN',
      });

    try {
      const loja = await this.prisma.$transaction(async (tx) => {
        const dono = await tx.storeSlug.findUnique({ where: { slug: payload.slug } });
        if (dono && dono.companyId !== companyId) throw jaUsado();
        // Voltar a um link que já foi seu é reaproveitá-lo, e não criar outro.
        if (!dono) await tx.storeSlug.create({ data: { slug: payload.slug, companyId } });
        return tx.storeSettings.upsert({
          where: { companyId },
          create: { companyId, slug: payload.slug, name: payload.name },
          update: { slug: payload.slug, name: payload.name },
        });
      });
      return { slug: loja.slug, name: loja.name, suggestedSlug: loja.slug };
    } catch (erro) {
      // Duas lojas pedindo o mesmo link ao mesmo tempo: a segunda esbarra na
      // chave do link, e ouve o mesmo que ouviria um instante depois.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw jaUsado();
      }
      throw erro;
    }
  }

  /**
   * A loja que um link abre, sem login. Só loja de empresa ativa: a que espera
   * aprovação, ou está suspensa, não aparece para o público.
   */
  async publicStore(slug: string): Promise<PublicStoreLookup> {
    const naoExiste = () =>
      new NotFoundException({ message: 'Loja não encontrada.', code: 'STORE_NOT_FOUND' });

    const link = await this.prisma.storeSlug.findUnique({
      where: { slug },
      select: {
        company: {
          select: {
            id: true,
            status: true,
            storeSettings: { select: { slug: true, name: true } },
          },
        },
      },
    });
    const loja = link?.company.storeSettings;
    if (!link || !loja || link.company.status !== 'ACTIVE') throw naoExiste();
    if (loja.slug !== slug) return { kind: 'moved', slug: loja.slug };

    const cardapio = await this.catalogo.publicCatalog(link.company.id);
    return { kind: 'store', store: { slug: loja.slug, name: loja.name, ...cardapio } };
  }
}
