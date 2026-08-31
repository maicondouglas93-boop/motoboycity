# Pix de faturas via Asaas

## Configuração

1. Crie/acesse primeiro o ambiente Sandbox do Asaas e gere uma API key.
2. Gere um token exclusivo para o webhook, com 32 a 255 caracteres e sem
   espaços. Ele **não** é a API key e nunca deve ir para o navegador ou Git.
3. Configure somente no ambiente da API (Render):

   ```text
   ASAAS_ENVIRONMENT=sandbox
   ASAAS_API_KEY=<chave do sandbox>
   ASAAS_WEBHOOK_TOKEN=<token exclusivo do webhook>
   ```

4. No painel Asaas, cadastre um webhook ativo com:

   - URL: `https://motoboycity-api.onrender.com/integrations/asaas/webhook`
   - token de autenticação: exatamente o valor de `ASAAS_WEBHOOK_TOKEN`;
   - evento: `PAYMENT_RECEIVED`;
   - versão da API: v3.

5. Publique a API com `prisma migrate deploy`. A migration é aditiva e cria
   apenas `asaas_customers`, `invoice_pix_charges` e `asaas_webhook_events`.
6. No Sandbox, use uma empresa controlada, abra uma fatura pendente, gere o QR
   Code e simule o recebimento. Confirme que a fatura muda para `PAID`, método
   `ONLINE`, e que reenviar o mesmo webhook não cria outro histórico.
7. A homologação deve usar banco isolado. Se o Sandbox já foi testado no mesmo
   banco da aplicação, publique primeiro a migration
   `20260831155700_asaas_environment_isolation`: ela marca os registros atuais
   como `SANDBOX` e impede reutilizar customer, cobrança, QR Code ou webhook no
   ambiente real.
8. Na conta **Produção** do Asaas, gere uma API key de produção e crie um novo
   webhook. Webhooks e credenciais do Sandbox não migram para Produção.
9. Desative o webhook do Sandbox e altere, juntas, as três variáveis da API:

   ```text
   ASAAS_ENVIRONMENT=production
   ASAAS_API_KEY=<chave da produção>
   ASAAS_WEBHOOK_TOKEN=<token do webhook de produção>
   ```

10. Depois que o deploy estiver saudável, faça um smoke com uma fatura
    controlada e de baixo valor: gere o Pix, confira valor e cliente no Asaas,
    pague de verdade e confirme webhook HTTP `200` e fatura `PAID`/`ONLINE` nos
    painéis Company e ADM.

## Garantias do fluxo

- Nenhum segredo é exposto no Company Web.
- O navegador não consegue marcar a própria fatura como paga.
- `PAYMENT_CONFIRMED` não quita a fatura; para Pix, a baixa usa apenas
  `PAYMENT_RECEIVED` com status `RECEIVED`.
- Valor em centavos, cliente Asaas, ID do pagamento e referência externa têm de
  corresponder à cobrança persistida.
- Customers, cobranças, QR Codes e eventos são isolados entre Sandbox e
  Produção. Uma fatura tem no máximo uma cobrança por ambiente.
- O ID do evento é único dentro do ambiente, então a entrega repetida do Asaas
  é segura.
- Após timeout de criação, a API consulta a referência externa antes de tentar
  criar novamente.
