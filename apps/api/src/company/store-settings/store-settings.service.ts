import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PublicStoreLookup, StoreIdentity, StoreSettings } from '@motoboycity/types';
import {
  suggestStoreSlug,
  type UpdateStoreIdentityPayload,
  type UpdateStoreLinkPayload,
} from '@motoboycity/validation';
import { Prisma, type StoreSettings as LojaGravada, type User } from '@prisma/client';
import { ImageKitService } from '../../media/imagekit.service';
import { detectSupportedImage, type UploadedImageFile } from '../../media/supported-image';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreOperationService } from '../store-operation/store-operation.service';

/**
 * A cara da loja antes de a empresa escolher: a da demonstração, que passa na
 * régua de contraste. É também o padrão das colunas no banco.
 */
export const IDENTIDADE_PADRAO: StoreIdentity = {
  theme: 'CLARO',
  brandColor: '#c2410c',
  actionColor: '#15803d',
  logoUrl: null,
};

type ComIdentidade = Pick<LojaGravada, 'theme' | 'brandColor' | 'actionColor' | 'logoUrl'>;

function identidade(loja: ComIdentidade): StoreIdentity {
  return {
    theme: loja.theme,
    brandColor: loja.brandColor,
    actionColor: loja.actionColor,
    logoUrl: loja.logoUrl,
  };
}

function paraConfiguracao(loja: LojaGravada): StoreSettings {
  return {
    slug: loja.slug,
    name: loja.name,
    suggestedSlug: loja.slug,
    identity: identidade(loja),
    recebePedidos: loja.acceptsOrders,
  };
}

const semLink = () =>
  new ConflictException({
    message: 'Crie o link da loja primeiro: é por ele que a loja existe.',
    code: 'STORE_LINK_REQUIRED',
  });

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
  private readonly logger = new Logger(StoreSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: StoreCatalogService,
    private readonly operacao: StoreOperationService,
    private readonly imageKit: ImageKitService,
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
    if (loja) return paraConfiguracao(loja);
    return {
      slug: null,
      name: empresa.tradeName,
      suggestedSlug: suggestStoreSlug(empresa.tradeName),
      identity: IDENTIDADE_PADRAO,
      recebePedidos: false,
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
      return paraConfiguracao(loja);
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
   * O tema e as duas cores. A régua de contraste já passou na entrada
   * (`updateStoreIdentitySchema`); aqui só se exige a loja: sem link, não há
   * página para vestir.
   */
  async updateIdentity(user: User, payload: UpdateStoreIdentityPayload): Promise<StoreSettings> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const { count } = await this.prisma.storeSettings.updateMany({
      where: { companyId },
      data: {
        theme: payload.theme,
        brandColor: payload.brandColor,
        actionColor: payload.actionColor,
      },
    });
    if (count === 0) throw semLink();
    return this.daEmpresa(companyId);
  }

  /**
   * Liga ou desliga os pedidos pela página. Desligada, a página volta a ser
   * vitrine; os pedidos já feitos continuam em Vendas até terminar.
   */
  async updateAcceptsOrders(user: User, recebePedidos: boolean): Promise<StoreSettings> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const { count } = await this.prisma.storeSettings.updateMany({
      where: { companyId },
      data: { acceptsOrders: recebePedidos },
    });
    if (count === 0) throw semLink();
    return this.daEmpresa(companyId);
  }

  /**
   * A logo sobe para o ImageKit e substitui a anterior, que é apagada lá depois
   * de gravada a nova. Se a gravação falha, quem sai é a que acabou de subir.
   */
  async setLogo(user: User, file: UploadedImageFile): Promise<StoreSettings> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    // Confere a loja antes de subir: sem link, a logo iria para o ImageKit à toa.
    await this.daEmpresa(companyId);
    const imagem = detectSupportedImage(file);
    const enviada = await this.imageKit.uploadStoreLogo({
      companyId,
      buffer: file.buffer,
      extension: imagem.extension,
    });

    try {
      const anterior = await this.trocarLogo(companyId, {
        logoUrl: enviada.url,
        logoExternalFileId: enviada.externalFileId,
      });
      if (anterior && anterior !== enviada.externalFileId) {
        await this.apagarLogoSemQuebrar(anterior, 'logo substituída');
      }
    } catch (erro) {
      await this.apagarLogoSemQuebrar(enviada.externalFileId, 'logo nova depois de falha');
      throw erro;
    }
    return this.daEmpresa(companyId);
  }

  /** Tirar a logo de quem não tem logo não é erro: dois toques, ou duas abas. */
  async removeLogo(user: User): Promise<StoreSettings> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.daEmpresa(companyId);
    const anterior = await this.trocarLogo(companyId, { logoUrl: null, logoExternalFileId: null });
    if (anterior) await this.apagarLogoSemQuebrar(anterior, 'logo removida');
    return this.daEmpresa(companyId);
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
            storeSettings: {
              select: {
                slug: true,
                name: true,
                theme: true,
                brandColor: true,
                actionColor: true,
                logoUrl: true,
                acceptsOrders: true,
              },
            },
            addresses: {
              where: { isPrimary: true },
              take: 1,
              select: { street: true, number: true, complement: true, city: true, state: true },
            },
          },
        },
      },
    });
    const loja = link?.company.storeSettings;
    if (!link || !loja || link.company.status !== 'ACTIVE') throw naoExiste();
    if (loja.slug !== slug) return { kind: 'moved', slug: loja.slug };

    const [cardapio, operacao] = await Promise.all([
      this.catalogo.publicCatalog(link.company.id),
      this.operacao.publicOperation(link.company.id),
    ]);
    // A retirada é no endereço que a loja escolheu, ou no da empresa. O da
    // empresa não tem bairro no cadastro: vai vazio.
    const principal = link.company.addresses[0];
    const enderecoDeRetirada =
      operacao.retirada.endereco ??
      (principal
        ? {
            rua: principal.street,
            numero: principal.number,
            complemento: principal.complement,
            bairro: '',
            cidade: principal.city,
            estado: principal.state,
          }
        : null);

    return {
      kind: 'store',
      store: {
        slug: loja.slug,
        name: loja.name,
        identity: identidade(loja),
        ...cardapio,
        operacao,
        recebePedidos: loja.acceptsOrders,
        enderecoDeRetirada,
      },
    };
  }

  private async daEmpresa(companyId: string): Promise<StoreSettings> {
    const loja = await this.prisma.storeSettings.findUnique({ where: { companyId } });
    if (!loja) throw semLink();
    return paraConfiguracao(loja);
  }

  /**
   * Troca a logo só se ela ainda for a que foi lida, e devolve o arquivo que
   * saiu. Três tentativas: mais que isso é alguém trocando a logo sem parar.
   */
  private async trocarLogo(
    companyId: string,
    logo: { logoUrl: string | null; logoExternalFileId: string | null },
  ): Promise<string | null> {
    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
      const atual = await this.prisma.storeSettings.findUnique({
        where: { companyId },
        select: { logoExternalFileId: true },
      });
      if (!atual) throw semLink();
      const { count } = await this.prisma.storeSettings.updateMany({
        where: { companyId, logoExternalFileId: atual.logoExternalFileId },
        data: logo,
      });
      if (count === 1) return atual.logoExternalFileId;
    }
    throw new ConflictException({
      message: 'A logo mudou enquanto você enviava. Tente de novo.',
      code: 'STORE_LOGO_STALE',
    });
  }

  private async apagarLogoSemQuebrar(externalFileId: string, contexto: string): Promise<void> {
    try {
      await this.imageKit.delete(externalFileId);
    } catch {
      this.logger.warn(`Nao foi possivel remover ${contexto} do ImageKit.`);
    }
  }
}
