# Secretária Virtual administrativa

## Escopo da primeira versão

A rota `POST /admin/virtual-secretary/chat` oferece consultas em linguagem
natural no `admin-web`. Ela exige JWT de administrador e tem limite próprio de
10 requisições por minuto. A primeira versão é deliberadamente somente leitura:
não existem ferramentas capazes de criar, alterar, cancelar, aprovar, bloquear
ou disparar qualquer ação operacional.

O navegador envia apenas a pergunta e até oito mensagens recentes. O backend
chama a Groq, executa no máximo três ferramentas permitidas e devolve a
resposta final. O histórico permanece no estado local da página e não é
persistido.

## Fluxo e isolamento

```text
admin-web -> JWT/AdminOnly -> VirtualSecretaryService -> Groq
                                      |
                                      +-> ferramentas de leitura
                                          -> services administrativos/domínio
                                          -> Prisma/PostgreSQL e Redis
```

O modelo nunca recebe Prisma, SQL, tokens ou acesso irrestrito à API. Para toda
resposta factual, a primeira chamada usa `tool_choice: required`. Consultas
adicionais podem ser solicitadas sequencialmente com `auto`, e a etapa final
forçada usa `none`. Nomes e argumentos JSON são validados em uma allowlist; uma
resposta usa no máximo três ferramentas e chamadas paralelas ficam desativadas.

| Ferramenta | Dados retornados |
| --- | --- |
| `gerar_resumo_administrativo` | relatório e operação de hoje |
| `consultar_relatorio_periodo` | contagens, valores, comparação e rankings reduzidos |
| `consultar_operacao_atual` | filas, pedidos ativos e motoboys online |
| `buscar_pedidos` | até 5 pedidos sem destinatário ou endereço |
| `buscar_empresas` | até 5 empresas sem dados do responsável |
| `buscar_entregadores` | até 5 motoboys sem CPF, telefone ou e-mail |
| `responder_sem_consulta` | saudação, fora de escopo ou recusa de escrita |

Resultados são limitados e reduzidos antes de sair do backend. Não são enviados
CPF, telefone, e-mail pessoal, endereço, coordenadas, destinatário, observações
ou credenciais. Conteúdo vindo do banco é marcado no prompt como dado não
confiável, nunca como instrução.

## Configuração

Configure somente no ambiente da API ou no secret manager:

```dotenv
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
GROQ_TIMEOUT_MS=30000
```

### Diagnóstico do provedor

- O padrão é `openai/gpt-oss-120b`, modelo de produção com suporte a ferramentas
  locais. Antes de alterar `GROQ_MODEL`, confirme compatibilidade com tool calling
  na [lista oficial de modelos](https://console.groq.com/docs/models).
- `401` ou `403` indica chave inválida, revogada ou sem acesso. Gere a chave no
  Groq Console e configure-a somente no ambiente da API.
- `429` indica limite de requisições, tokens ou uso diário. Consulte os limites
  atuais da organização no console e na
  [documentação de rate limits](https://console.groq.com/docs/rate-limits).
- Timeout vira `504`; indisponibilidade/cota vira `503`; demais falhas externas
  viram `502`. O SDK não repete automaticamente a chamada, evitando prender uma
  requisição por múltiplos timeouts.

Erros do provedor continuam convertidos em resposta controlada para o cliente;
o log técnico contém somente etapa, modelo, status, classe do erro e duração,
sem pergunta, resposta, argumentos, resultados ou chave.

Não use prefixo `NEXT_PUBLIC_`. Se uma chave aparecer em chat, log, issue ou
commit, revogue-a no Groq Console, gere outra e substitua o secret do ambiente.
A aplicação funciona sem a chave; apenas a rota da Secretária retorna `503` com
mensagem controlada.

## Auditoria e privacidade

`virtual_secretary_audits` é append-only no fluxo da aplicação e registra
`requestId`, administrador, ação, ferramenta, status, duração, parâmetros já
validados e resultados já reduzidos. No chat, registra somente tamanho da
mensagem, quantidade de histórico, ferramentas e tamanho da resposta.

O texto da conversa e a chave da Groq não são persistidos. Erros externos são
convertidos em mensagens genéricas antes de chegar ao cliente ou à auditoria.
Para ambientes com exigência adicional de privacidade, avalie habilitar Zero
Data Retention conforme a
[documentação de dados da Groq](https://console.groq.com/docs/your-data).

## Migração, deploy e rollback

As migrations `20260823161747_virtual_secretary_audit` e
`20260823162007_preserve_surcharge_updated_at_default` foram aplicadas somente
no PostgreSQL local. A primeira adiciona enum, tabela, índices e FK de auditoria.
Ao ser gerada, ela também detectou um default histórico de `surcharges.updatedAt`
ausente no schema e tentou removê-lo. A migration compensatória preserva o
default original, e o schema agora o declara explicitamente.

Em ambiente compartilhado: faça backup verificável, restaure em uma cópia
isolada, execute `prisma migrate deploy`, valide auditoria e autenticação, faça
deploy da API e então do admin-web. Nenhuma migration compartilhada foi
executada nesta implementação.

Rollback da aplicação pode manter a tabela de auditoria sem uso. Rollback de
banco deve remover primeiro FK, índices e tabela e só então o enum; o default de
`surcharges.updatedAt` deve permanecer.

## Próxima fase: ações com escrita

Não basta adicionar uma ferramenta que escreve. Antes disso, defina permissões
granulares, confirmação explícita com resumo do impacto, idempotency key,
validação no service de domínio, auditoria de antes/depois e testes de
concorrência. Até essa política existir, pedidos de escrita são recusados.
