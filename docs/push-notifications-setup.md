# Notificações push — o que já está pronto e o que falta você fazer

Sem push, a oferta de entrega só chega ao motoboy com o **aplicativo aberto na
tela**. O socket precisa de conexão viva, e o caso que importa é o oposto: o
motoboy esperando corrida com o celular no bolso. Sem isso, a oferta expira
sozinha e o pedido volta para a fila sem que ninguém tenha sido avisado de
verdade.

O caminho inteiro está construído. Falta **uma coisa que só você pode fazer**:
criar o projeto no Firebase e trazer as credenciais.

---

## O que você precisa fazer

Nenhum destes passos eu faço: criar conta, baixar credencial e definir senha são
ações suas.

### 1. Criar o projeto no Firebase

1. Acesse o console do Firebase e crie um projeto (pode se chamar
   `motoboycity`).
2. Dentro dele, adicione um **aplicativo Android**.
3. Em "nome do pacote", use exatamente: `com.motoboycity.driverapp`.

O nome do pacote precisa bater com o do aplicativo. Se divergir, o Firebase
aceita o cadastro e o push simplesmente nunca chega — sem erro nenhum.

### 2. Baixar o `google-services.json`

O console oferece o arquivo ao final do cadastro do aplicativo. Coloque-o em:

```
apps/driver-app/android/app/google-services.json
```

Ele **não entra no repositório** — já está no `.gitignore`, porque este
repositório é público e o arquivo identifica o seu projeto do Firebase.

Sem o arquivo, o aplicativo continua compilando normalmente, só que sem push. O
build avisa com uma linha de log em vez de falhar.

### 3. Gerar a credencial do servidor

No console: **Configurações do projeto → Contas de serviço → Gerar nova chave
privada**. Vem um arquivo JSON.

Desse JSON, três campos viram variáveis de ambiente da API:

| Variável                | Campo no JSON  |
| ----------------------- | -------------- |
| `FIREBASE_PROJECT_ID`   | `project_id`   |
| `FIREBASE_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_PRIVATE_KEY`  | `private_key`  |

Três variáveis separadas, e não o JSON inteiro numa só: painel de hospedagem
lida melhor com campos curtos, e um JSON completo num campo de texto é o tipo de
coisa que acaba colado num chat ou num commit.

**A `private_key` é segredo de verdade.** Guarde só no painel de variáveis do
provedor. Não cole em conversa, não commite, não mande por mensagem — nem para
mim.

Ela contém quebras de linha. A maioria dos painéis guarda tudo em uma linha só,
então ela chega com `\n` escapado — a API já trata isso.

### 4. Conferir que ligou

Suba a API e olhe o log da inicialização:

- `Push ativo no projeto <id>` → funcionando;
- `Push desligado: FIREBASE_PROJECT_ID... não estão configuradas` → falta
  variável.

---

## O que já está construído

### No servidor

- **`DeviceToken`**: o aparelho registrado. O token é único no sistema inteiro,
  e não por motoboy — um mesmo celular pode trocar de dono, e sem a unicidade a
  oferta de um tocaria no aparelho do outro, com o número do pedido aparecendo
  na notificação de quem não é dono dele.
- **`POST /driver/push-tokens`** e **`DELETE /driver/push-tokens/:token`**. A
  remoção é filtrada por dono: sem isso, alguém com um token qualquer conseguiria
  calar as ofertas de outro motoboy.
- **Envio na oferta**, junto do socket. Não bloqueia o despacho: se o Firebase
  estiver fora do ar, o pedido segue ofertado e o prazo continua correndo. Push
  indisponível não pode virar pedido não despachado.
- **Envio no aviso de motoboy sem posição** — que antes só alcançava o admin,
  porque o socket não chega em aplicativo encerrado, e aplicativo encerrado é
  justamente a causa mais provável de a posição ter sumido.
- **Limpeza de token morto**: o FCM só avisa que um token expirou na hora do
  envio, então é ali que o registro é apagado. Falha de rede **não** apaga — isso
  deixaria o motoboy sem push até reinstalar o aplicativo.
- **Serviço inerte sem credencial.** Um piloto pode começar sem Firebase, e
  derrubar a API por falta de variável transformaria recurso ausente em sistema
  fora do ar.

### No aplicativo

- **Dois canais de notificação**, criados no início do aplicativo:
  `ofertas` em importância máxima (aparece sobre a tela e toca) e `avisos` em
  importância normal. Precisam existir antes da primeira mensagem: a partir do
  Android 8, notificação com canal inexistente é **descartada em silêncio**.
- **Permissão pedida no Android 13+**, onde o padrão é negado. Abaixo disso, ela
  vem na instalação.
- **Registro do token ao conectar** e **acompanhamento da troca**. O FCM troca o
  token sozinho — restauração de backup, limpeza de dados, reinstalação — e sem
  acompanhar, o motoboy para de receber oferta sem nada na tela dizendo isso.
- **Desregistro ao sair da conta**, antes de limpar a sessão.
- **Handler de segundo plano** registrado fora do React, porque com o aplicativo
  encerrado o Android sobe um contexto onde nenhum componente existe ainda.

---

## Limites conhecidos

**Nada disto foi testado em aparelho.** O caminho tem 20 testes automatizados,
mas eles provam a lógica, não a entrega: o que garante que a notificação apareça
e toque é a combinação de canal, prioridade e permissão no Android real. O
primeiro teste de verdade é instalar num celular e lançar um pedido.

**iOS não está configurado.** O modelo já tem o campo de plataforma e o código
trata o caso, mas falta certificado APNs e o arquivo do projeto. O piloto é
Android, conforme o runbook.

**A oferta chega como notificação do sistema, não como tela cheia.** Ela toca e
aparece sobre o que estiver na tela, mas não toma o aparelho como uma ligação. Se
na prática o motoboy ainda perder ofertas, o próximo passo é uma notificação de
tela cheia — que exige permissão adicional no Android 14+ e vale decidir com
dado, não por precaução.
