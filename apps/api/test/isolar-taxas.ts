import type { PrismaService } from './../src/prisma/prisma.service';

/**
 * Desliga as taxas adicionais durante o teste e devolve como religar.
 *
 * Os testes de entrega montam a propria tabela de preco, mas HERDAM as taxas
 * adicionais cadastradas no banco de desenvolvimento — elas sao por regiao, e
 * todos usam a mesma. Com uma "taxa noturna" ativa, `12,50` vira `14,00` e a
 * suite passa de dia e falha de noite.
 *
 * A alternativa correta e cada suite criar a propria regiao, o que isola de
 * verdade. Isto aqui e o meio-termo barato: mexe em uma coluna e devolve o
 * estado no fim.
 *
 * SE UMA EXECUCAO MORRER NO MEIO, as taxas ficam desligadas. Para religar:
 *
 *   node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.surcharge.updateMany({data:{active:true}}).then(r=>console.log(r))"
 */
export async function desligarTaxasAdicionais(
  prisma: PrismaService,
): Promise<() => Promise<void>> {
  const ativas = await prisma.surcharge.findMany({
    where: { active: true },
    select: { id: true },
  });

  if (ativas.length === 0) {
    return async () => undefined;
  }

  const ids = ativas.map((taxa) => taxa.id);
  await prisma.surcharge.updateMany({ where: { id: { in: ids } }, data: { active: false } });

  return async () => {
    await prisma.surcharge.updateMany({ where: { id: { in: ids } }, data: { active: true } });
  };
}
