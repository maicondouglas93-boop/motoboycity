# Protocolo de execução para agentes de IA

> Eficiência, neste projeto, significa chegar ao resultado correto com a menor
> mudança e a menor repetição possíveis. Velocidade nunca justifica leitura
> superficial, perda de evidência ou validação insuficiente.

## 1. Precedência e fontes de verdade

Use esta ordem. Se houver conflito, a fonte anterior prevalece:

1. instruções do sistema, do usuário e `AGENTS.md`;
2. `docs/business-rules.md`, para decisões de negócio confirmadas;
3. `docs/agent-handoff.md`, para o estado atual, e `docs/architecture.md`,
   para a organização do sistema. O histórico fica em `docs/changelog.md`,
   que é registro de época e não referência do que vale hoje;
4. `docs/ai-agent-guide.md`, para o fluxo de trabalho e armadilhas conhecidas;
5. este protocolo, como complemento operacional.

Não transforme memória, nome de arquivo, comentário antigo ou relatório de outro
agente em fato atual. Quando documentação e código divergirem, confirme a data e
o comportamento real, informe a divergência e não a resolva silenciosamente.

## 2. Protocolo antes de agir

1. Classifique o pedido: análise, diagnóstico, implementação, validação ou
   release. Análise e diagnóstico não autorizam alteração de código.
2. Leia `git status --short` e o histórico recente. Preserve qualquer mudança
   que já estava no worktree.
3. Consulte somente as seções relevantes das fontes de verdade, sem ignorar
   nenhuma regra diretamente relacionada ao fluxo.
4. Localize implementação e consumidores com busca textual rápida (`rg` ou
   equivalente) e leia o corpo das funções importantes.
5. Separe o que encontrou em:
   - **confirmado**: demonstrado pelo código, teste ou configuração atual;
   - **inferência**: conclusão explicada a partir das evidências;
   - **não confirmado**: precisa de ambiente, credencial, banco ou decisão.
6. Para uma tarefa não trivial, defina um plano curto e verificável antes de
   editar. Faça uma fase por vez.

Hipóteses reversíveis podem ser usadas para continuar trabalhando quando não
mudam o resultado esperado. Não suponha regra de negócio, autorização,
persistência, segurança, valor financeiro ou comportamento destrutivo.

## 3. Profundidade proporcional ao risco

Não faça uma auditoria full-stack para uma alteração visual isolada. Mapeie a
cadeia completa quando o fluxo atravessar contrato, autorização, persistência,
fila, realtime, preço, sessão ou mais de um cliente.

Para mudanças de contrato, percorra os consumidores reais:

```text
packages/validation
  -> packages/types
    -> packages/api-client
      -> controller + ZodValidationPipe
        -> service + Prisma
          -> web/mobile
            -> fila, push e realtime quando aplicável
```

No Driver App, verifique JavaScript/TypeScript e também `android/` e `ios/`
sempre que o tema envolver permissões, GPS, background, push, overlay, build,
assinatura, deep link ou ponte nativa.

## 4. Uso obrigatório das skills do projeto

Leia integralmente a skill aplicável antes de agir:

- `motoboycity-prisma-contracts`: Prisma, migrations, banco, Zod, tipos,
  payloads, rotas e `api-client`;
- `motoboycity-delivery-core`: entregas, preço, Maps, dispatch, ofertas,
  presença, BullMQ, cancelamento, status e realtime operacional;
- `motoboycity-driver-mobile`: React Native, sessão mobile, ofertas, GPS,
  Android/iOS, permissões, URL da API, push e release nativo;
- `motoboycity-web-integration`: Admin Web, Company Web, autenticação,
  TanStack Query, formulários, API real e Socket.IO nos painéis;
- `motoboycity-verification`: auditoria, regressão, segurança, dependências,
  testes e prontidão de release.

Use o menor conjunto que cubra o pedido. Quando duas skills forem necessárias,
declare a ordem. A skill orienta o trabalho, mas não substitui evidência nem
amplia a autorização dada pelo usuário.

## 5. Subagentes

Delegue somente análises independentes e somente leitura. Não delegue escritas
nem tarefas paralelas que possam tocar o mesmo schema, contrato ou dispatch.

Todo subagente deve receber escopo fechado e retornar:

- conclusão objetiva;
- arquivos, símbolos e linhas que sustentam a conclusão;
- riscos e lacunas não verificadas;
- nenhum código alterado.

O coordenador lê as evidências, resolve contradições e executa todas as escritas.
Não repita localmente a mesma investigação sem motivo demonstrável.

## 6. Regras de implementação

- Faça a menor mudança que atenda ao pedido; não refatore código adjacente por
  preferência pessoal.
- Nunca exponha ou edite `.env`, chaves, tokens ou credenciais sem autorização
  explícita. Não copie seus conteúdos para logs, testes ou documentação.
- Não altere migration aplicada. Mudanças Prisma devem seguir o protocolo de
  `docs/ai-agent-guide.md` e ser aditivas sempre que possível.
- Não aplique migration, seed, `db push`, Docker Compose ou E2E contra serviço
  compartilhado sem autorização específica e ambiente isolado.
- Valores financeiros, transições e dispatch precisam ser idempotentes,
  auditáveis e protegidos contra concorrência.
- Não trate UI com mock, fallback estático ou estado local como integração real.
- Preserve mudanças não relacionadas e revise o diff antes de concluir.
- Registre em `docs/changelog.md` e atualize `docs/agent-handoff.md` e
  `docs/architecture.md` quando houver mudança funcional, de contrato,
  infraestrutura ou validação, sem registrar secrets.
- Commit, push, PR e APK exigem pedido explícito para aquela ação. Um pedido
  antigo não concede autorização permanente.

## 7. Validação proporcional

Escolha a menor validação capaz de detectar regressão no recorte:

| Mudança | Validação mínima esperada |
|---|---|
| documentação/instrução | `git diff --check` e revisão do diff |
| função isolada | teste focado + typecheck do workspace |
| contrato compartilhado | build de validation + typecheck/lint da raiz + consumidores |
| API/persistência | testes focados + build da API; E2E se houver ambiente isolado |
| web | typecheck/lint + build do painel; smoke autenticado quando necessário |
| mobile JS | testes focados + typecheck/lint do app |
| mobile nativo/release | compilação nativa relevante; APK somente se solicitado |
| concorrência/dispatch | teste de disputa real e idempotência, preferencialmente E2E |

Não transforme "comando não executado" em "aprovado". Registre separadamente:
passou, falhou por defeito, não executou por ambiente ou permanece manual.

## 8. Critério de conclusão

Uma tarefa só está concluída quando:

1. o comportamento pedido existe ou o diagnóstico está provado;
2. contratos e consumidores do recorte permanecem coerentes;
3. a validação proporcional foi executada e relatada honestamente;
4. o diff contém apenas mudanças intencionais;
5. limitações, riscos e próximo passo concreto estão registrados;
6. nenhuma ação externa ou destrutiva ficou implícita.

Na resposta final, comece pelo resultado. Informe arquivos alterados, testes e
resultados, limitações reais e qualquer ação que ainda dependa do usuário.
