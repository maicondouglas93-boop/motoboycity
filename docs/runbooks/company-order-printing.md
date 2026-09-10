# Cupom de entrega da loja — bobina de 80 mm

## Uso

1. No painel da empresa, abra **Pedidos** e clique em **Imprimir pedido** na
   lista ou nos detalhes. Apenas a loja responsável vê a ação.
2. Confira o cupom e clique em **Imprimir pedido** na prévia. O botão busca
   novamente os dados antes de chamar a janela padrão de impressão.
3. Selecione a Elgin i8/i9 previamente instalada no sistema operacional, papel
   **80 mm**, escala **100%**, e desative cabeçalhos/rodapés do navegador.
4. Imprima uma amostra e ajuste o comprimento/corte da bobina nas preferências
   do driver, se necessário. Não há acesso USB nem impressão silenciosa.

Para reimprimir com o motoboy/status atualizado, use novamente o botão da
prévia. Ctrl+P imprime a prévia carregada e não executa a atualização assíncrona.
Fechar/cancelar a janela de impressão não muda o pedido.

## Escopo aprovado

- Cupom **operacional de entrega**, não comanda de produtos nem documento fiscal.
- Loja, número, modalidade existente, criação/status, agendamento quando houver,
  referência externa da loja, retorno, destinatário, endereço `DROPOFF`, instruções,
  responsável atual, conferente e horário da impressão em Brasília.
- Sem seções de produtos, valores, taxas, total, pagamento ou troco, conforme
  confirmação do responsável. Observações livres são preservadas como registradas;
  o sistema não tenta apagar palavras ou valores que alguém escreveu nesse texto.
- Dados do destinatário/endereço são os registrados no pedido, sem consultar o
  cadastro atual do cliente. Campos ausentes recebem linhas para caneta.
- Não existe bairro estruturado no contrato: permanece linha manual. Não foi
  criada migration. `PICKUP` é a coleta na loja, não retirada varejista pelo cliente.
  Não inventamos tipos "retirada" ou "avulso" nem inferimos isso de pedidos em lote.
- Responsável vem da atribuição do pedido; não de histórico/ofertas recusadas.
  Atribuição residual em pedido redistribuído/cancelado não aparece no cupom.

## Implementação e segurança

Rota `/pedidos/[id]/imprimir`, no grupo `(print)` do Company Web, com `AuthGate`
e sem `TopNav`. `DeliveryPrintLink` usa identidade e perfil da empresa para
controlar a ação. `DeliveryPrintView` valida novamente o perfil e consulta
`GET /deliveries/operations?deliveryId=<id>`; a API existente filtra pela empresa
do membro ativo, e a página também confere `companyId`. Inclui pedidos encerrados
pela coleção `recent`, sem janela de data quando filtrados por ID.

O endpoint `detail` **não** é usado para imprimir: no fluxo existente ele pode
geocodificar e gravar endereço de destino GPS. As duas consultas da impressão
(perfil/operations) são somente leitura. Não alteramos API, contratos, banco,
status, financeiro, dispatch, lote, sessão, mapas ou aplicativo do motoboy.

Cache do cupom é removido ao sair; sem polling. Cada clique reconsulta antes de
imprimir. Falha na atualização esconde a prévia antiga e não abre a impressão.
Há bloqueio síncrono de clique duplicado, espera de renderização/fontes e proteção
contra impressão após desmontagem ou mudança da sessão durante a preparação.

`DeliveryReceipt` renderiza texto escapado pelo React, sem HTML do usuário.
CSS usa 72 mm úteis, preto/branco e `@page deliveryReceipt { size: auto; margin:
2mm }`. A largura de papel/altura vêm do **driver**. Não usar `size: 80mm auto`:
essa combinação não é válida em CSS. Referência: [MDN — @page size](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40page/size).
`@media print` oculta controles/portais e remove altura mínima/flex da shell,
sem altura de bobina fixa. Textos quebram sem truncamento; campos, bloco do
motoboy e rodapé evitam quebras internas quando couberem na página.

## Validação e publicação

- Company Web: **126 testes em 28 suítes**, incluindo 20 novos testes do cupom/
  acesso/preparação; typecheck, lint e build aprovados.
- Navegador interno com API fictícia exclusiva de loopback: login, ações na lista/detalhe,
  cupom completo, ausência/parcial de endereço, notas longas e troca do responsável
  na reimpressão. Área útil medida em ~72 mm, sem overflow horizontal.
- CSS de impressão compilado foi inspecionado. A chamada `window.print()` e o
  bloqueio em falhas são cobertos por testes. O navegador interno não apresentou
  um diálogo de impressão inspecionável: **prévia paginada do driver, ausência
  de folha extra e impressão/corte físicos na Elgin ainda precisam de ensaio**.
- Não houve ensaio HTTP autenticado contra API/DB reais. Autorização da API
  existente foi conferida no código; cenários de resposta negada cruzada são
  testados no cliente. Não foram executadas migrations nem E2E com banco.
- Publicar somente Company Web após autorização. Sem alteração na API/Render,
  variáveis novas ou APK. Validar primeira amostra na loja antes de uso regular.
- Rollback: reverter este recorte de Company Web; nenhum dado precisa de reversão.
