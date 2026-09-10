# Taxa automática de chuva — Lajinha–MG

## Configuração e publicação

1. Em **ADM → Configurações → Taxas adicionais**, mantenha/crie a taxa de chuva
   da região de Lajinha, com o valor e repasse aprovados. Copie o **ID da taxa**
   mostrado no card. A integração não procura pelo nome nem altera valor,
   repasse, região, interruptor manual ou horários.
2. Após autorização para publicar o código, faça deploy da API e do ADM.
   Não há migration, alteração de dados existentes ou necessidade de APK.
3. Configure no serviço **API do Render**:

   | Variável | Valor |
   |---|---|
   | `OPEN_METEO_RAIN_SURCHARGE_ID` | UUID da taxa de chuva de Lajinha |
   | `OPEN_METEO_RAIN_ENABLED` | `true` habilita; ausente/`false` desliga |
   | `OPEN_METEO_API_KEY` | opcional; sem chave usa endpoint público; com chave usa o comercial |

4. Reinicie/republique a API após mudar variáveis. No ADM, a taxa vinculada
   mostrará o estado climático e a hora do dado. Sem ID válido ou habilitação,
   não há consulta externa nem ativação automática. A chave NÃO é obrigatória.
5. Deixe o **manual desligado** e retire horários que não deveriam cobrar
   independentemente do clima. A taxa precisa estar **ativa**. Para parar
   imediatamente toda cobrança desta taxa, use **Desativar** no ADM. Desligar
   só o manual NÃO desliga clima nem horários. Reativar a taxa volta a permitir
   todas as fontes, inclusive o clima ainda válido.

O endpoint público funciona sem chave, conforme solicitado pelo responsável.
Isso não equivale a licença comercial: os termos do Open-Meteo restringem o
serviço gratuito a uso não comercial, independentemente do volume. Confirmar
licença/autorização apropriada antes da ativação comercial. O sistema não faz
assinaturas nem autoriza despesas. Uma chave comercial inválida não causa
fallback silencioso para a API pública. Nunca colocar chave no Git, chat,
mobile, Vercel ou variável `NEXT_PUBLIC_*`.

Nenhuma configuração de produção foi alterada durante a implementação.

## Regra e limites

- Referência fixa: `-20.15139, -41.62278`, Lajinha, Minas Gerais, BR. Coordenadas
  verificadas no geocoding oficial e salvas no código. **Zero consultas de
  geocoding em operação**, nenhum GPS de empresa/entregador enviado ao provedor.
- Consulta `/v1/forecast` a cada cinco minutos: `current=rain,showers,weather_code`,
  unidade mm, tempo UNIX, fuso `America/Sao_Paulo`. Chuva/pancadas acima de zero
  OU WMO de garoa, chuva/pancadas/temporal ativa a contribuição automática.
  Nuvens, neblina e probabilidade de chuva futura não ativam.
- Após a primeira amostra seca, a ativação permanece até completar 30 minutos.
  Nova chuva cancela a contagem; polling repetido não reinicia esse prazo.
- Open-Meteo usa **modelos meteorológicos**, não sensores de cada rua. Dados
  atuais têm passo de 15 minutos; consultar a cada cinco minutos não torna a
  detecção instantânea nem comprova chuva em cada ponto da cidade.
- Dados com 30 minutos ou mais, futuros, fora de ordem, de outra localização
  ou sem unidades/campos válidos não autorizam cobrança automática. Em falha,
  o último dado válido só vale até esse limite; falha não inventa chuva nem
  contabiliza tempo seco. Manual e horários continuam independentes.
- O motor de preços existente continua escolhendo **no máximo uma taxa**, pela
  mesma prioridade de criação mais recente e divisão do adicional. Não há
  escrita em entregas existentes. Preços já congelados não mudam. Pedidos com
  **destino/preço definidos na entrega** continuam usando a regra vigente na
  primeira precificação, como antes desta integração.

## Cache, desempenho e recuperação

`WeatherModule` é compartilhado pela precificação e pelo ADM. Cada processo
sincroniza um pequeno snapshot no Redis a cada minuto. O lock de cinco minutos
limita chamadas/retries entre instâncias; a gravação verifica seu dono para
impedir sobrescrita por resposta atrasada. A decisão em cada pedido/lista é
**somente em memória**, sem HTTP nem leitura adicional do banco/Redis.
Instâncias podem levar até um minuto para sincronizar o estado.

O snapshot permanece no Redis por duas horas para recuperação de restart;
isso NÃO prolonga os 30 minutos de validade meteorológica. Sem dado recente, a
automação não cobra. Timeout HTTP de cinco segundos e falhas não impedem a API
de iniciar. Desabilitada, não abre conexão Redis adicional. Uso nominal:
**288 chamadas de clima/dia**, independentemente do número de empresas,
pedidos ou celulares. Nenhuma consulta de geocoding recorrente.

Logs `rain_automation_changed` registram mudanças detectadas nas consultas,
ID da taxa e amostra, sem chave nem autor administrador fictício. O adicional
efetivamente cobrado permanece em `Delivery.surchargeLabel/surchargeValue`.
Logs climáticos não são um arquivo meteorológico permanente. A tela atribui
os dados ao Open-Meteo e mostra quando se usa o endpoint público.

Rollback: **Desativar** a taxa no ADM cessa todas as fontes imediatamente.
Para desligar só o automático, definir `OPEN_METEO_RAIN_ENABLED=false` em todas
as instâncias da API e republicar. Não apagar dados nem alterar pedidos/faturas.

## Verificação de publicação

Conferir taxa correta, dado recente e estado no ADM. Sem chuva atual, o
automático deve ficar desligado. Não forçar clima fictício ou criar cobranças
em produção para testar. Validar o ciclo completo em ambiente isolado antes
da ativação. Testes automatizados usam HTTP/Redis simulados; não validam a
credencial comercial ou concorrência com Redis gerenciado real.

Fontes consultadas em 10/09/2026: [API/WMO](https://open-meteo.com/en/docs),
[geocoding](https://open-meteo.com/en/docs/geocoding-api),
[termos](https://open-meteo.com/en/terms), [planos](https://open-meteo.com/en/pricing).
