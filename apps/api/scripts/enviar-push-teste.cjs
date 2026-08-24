/**
 * Dispara um push de teste para os aparelhos registrados.
 *
 * Existe para isolar o caminho do push do resto: sem montar empresa, tabela de
 * preco e pedido, da para saber se credencial, token e canal estao de pe. Se
 * isto funcionar e a oferta real nao, o problema esta no despacho, nao no push.
 *
 * Uso:
     *   node scripts/enviar-push-teste.cjs           -> manda uma OFERTA (tela cheia + botoes)
     *   node scripts/enviar-push-teste.cjs aviso     -> manda um aviso comum
 */
const fs = require('node:fs');
const path = require('node:path');
const { cert, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { PrismaClient } = require('@prisma/client');

const BARRA_N = String.fromCharCode(92) + 'n';

function lerEnv() {
  const env = {};
  const caminhoDoEnv = path.join(__dirname, '..', '.env');
  for (const linha of fs.readFileSync(caminhoDoEnv, 'utf8').split(/\r?\n/)) {
    const igual = linha.indexOf('=');
    if (igual === -1) continue;
    const chave = linha.slice(0, igual);
    if (!chave.startsWith('FIREBASE_')) continue;
    let valor = linha.slice(igual + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    env[chave] = valor;
  }
  return env;
}

(async () => {
  const env = lerEnv();
  const prisma = new PrismaClient();

  const tokens = await prisma.deviceToken.findMany({
    include: { driver: { include: { user: { select: { name: true } } } } },
  });
  console.log('Aparelhos registrados:', tokens.length);
  for (const t of tokens) {
    console.log(`  ${t.driver.user.name} — ${t.platform} — token ...${t.token.slice(-12)}`);
  }
  if (tokens.length === 0) {
    console.log('\nNenhum aparelho. Entre no aplicativo com um motoboy primeiro.');
    await prisma.$disconnect();
    return;
  }

  const app = initializeApp(
    {
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: (env.FIREBASE_PRIVATE_KEY || '').split(BARRA_N).join('\n'),
      }),
    },
    'teste-' + Date.now(),
  );

  const modo = process.argv[2] === 'aviso' ? 'aviso' : 'oferta';
  const messaging = getMessaging(app);

  for (const t of tokens) {
    // Mesmo formato que o PushService monta: oferta so com dados, para o
    // servico nativo montar a tela cheia com os botoes.
    const payload =
      modo === 'oferta'
        ? {
            token: t.token,
            data: {
              type: 'offer',
              offerId: 'teste-' + Date.now(),
              title: 'Nova entrega para voce',
              body: 'TESTE — Lanchonete do Ze. Toque para ver.',
            },
            android: { priority: 'high', ttl: 0 },
          }
        : {
            token: t.token,
            notification: { title: 'MOTOboyCity', body: 'TESTE — aviso comum.' },
            android: { priority: 'high', notification: { channelId: 'avisos' } },
          };

    try {
      const id = await messaging.send(payload);
      console.log(`\nENVIADO (${modo}) para ...${t.token.slice(-12)}`);
      console.log('  id da mensagem:', id);
    } catch (e) {
      console.log(`\nFALHOU para ...${t.token.slice(-12)}`);
      console.log('  ', String(e.message).slice(0, 200));
    }
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(String(e).slice(0, 300));
  process.exit(1);
});
