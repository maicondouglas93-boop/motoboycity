import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD_HASH_ROUNDS = 10;
const DEFAULT_ADMIN_EMAIL = 'admin@motoboycity.local';
const DEFAULT_ADMIN_PASSWORD = 'admin_dev_only_change_me';

/**
 * Seed mínimo de infraestrutura — não é dado de negócio.
 * Sem suporte a múltiplas praças ainda (Fase 10 futura), o cadastro de
 * empresa precisa de uma Region válida para associar. Cria uma única
 * região padrão caso nenhuma exista.
 */
async function seedDefaultRegion(): Promise<void> {
  const existing = await prisma.region.findFirst();
  if (existing) {
    console.log(`Region já existe (${existing.name}), nada a fazer.`);
    return;
  }

  const region = await prisma.region.create({
    data: { name: 'Região Padrão' },
  });
  console.log(`Region criada: ${region.name} (${region.id})`);
}

/**
 * Não existe (e não deve existir) autocadastro de administrador — alguém
 * precisa ser o primeiro. Cria um único admin bootstrap se nenhum existir,
 * com credenciais vindas de env (ou um padrão de desenvolvimento óbvio).
 * Troque a senha em produção antes de expor a API publicamente.
 */
async function seedBootstrapAdmin(): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { type: 'ADMIN' } });
  if (existing) {
    console.log(`Admin já existe (${existing.email}), nada a fazer.`);
    return;
  }

  const email = process.env['ADMIN_SEED_EMAIL'] ?? DEFAULT_ADMIN_EMAIL;
  const password = process.env['ADMIN_SEED_PASSWORD'] ?? DEFAULT_ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

  const user = await prisma.user.create({
    data: {
      type: 'ADMIN',
      name: 'Administrador MOTOboyCity',
      email,
      phone: '00000000000',
      passwordHash,
      adminUser: { create: {} },
    },
  });
  console.log(
    `Admin bootstrap criado: ${user.email} (senha via ADMIN_SEED_PASSWORD ou padrão de dev)`,
  );
}

async function main(): Promise<void> {
  await seedDefaultRegion();
  await seedBootstrapAdmin();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
