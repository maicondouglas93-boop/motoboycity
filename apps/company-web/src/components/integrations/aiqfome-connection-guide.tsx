import { CheckCircle2, ExternalLink, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const steps = [
  {
    title: 'Confira os dados da loja',
    description:
      'Faça o processo com o responsável principal, confira o endereço de coleta e use o mesmo CNPJ cadastrado para a loja no aiqfome.',
  },
  {
    title: 'Abra o Geraldo do aiqfome',
    description:
      'No menu do Geraldo, abra Integrações. Se houver mais de uma unidade, use Trocar loja e selecione exatamente a loja que será conectada.',
  },
  {
    title: 'Vincule o ID Magalu',
    description:
      'Clique em Vincular ID Magalu, ou no botão de vínculo exibido pelo painel. Entre com o mesmo e-mail cadastrado como dono da loja e aceite os consentimentos.',
  },
  {
    title: 'Conecte pelo MOTOboyCity',
    description:
      'Volte a esta página e clique em Conectar com aiqfome. Você será direcionado para a autorização segura do ID Magalu.',
  },
  {
    title: 'Autorize somente uma loja',
    description:
      'Escolha a mesma loja preparada no Geraldo, permita o acesso à loja e aos pedidos e aguarde o retorno automático para o MOTOboyCity.',
  },
  {
    title: 'Ative a importação',
    description:
      'Confira a loja vinculada, escolha a modalidade, informe o tempo de preparo ou use o padrão do ADM e clique em Salvar e ativar importação.',
  },
] as const;

interface AiqfomeConnectionGuideProps {
  isConnected: boolean;
  operationalReady: boolean;
}

export function AiqfomeConnectionGuide({
  isConnected,
  operationalReady,
}: AiqfomeConnectionGuideProps) {
  const status = operationalReady
    ? {
        title: 'Integração pronta para receber pedidos',
        description: 'Confirme abaixo os selos Conectado e Importação ativa.',
      }
    : isConnected
      ? {
          title: 'Loja conectada: falta ativar a importação',
          description: 'Escolha abaixo a modalidade e o tempo de preparo para concluir.',
        }
      : {
          title: 'Próximo passo: prepare a loja no Geraldo',
          description: 'Siga os passos na ordem e depois use o botão Conectar com aiqfome abaixo.',
        };

  return (
    <Card className="border-portal/15">
      <CardHeader className="gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="mb-2 flex items-center gap-2 text-portal">
            <span className="rounded-xl bg-portal-soft p-2">
              <ListChecks className="size-5" aria-hidden="true" />
            </span>
            <Badge variant="outline">Passo a passo</Badge>
          </div>
          <CardTitle role="heading" aria-level={2}>
            Como conectar sua loja aiqfome
          </CardTitle>
          <CardDescription className="mt-1 max-w-3xl">
            Faça as etapas na ordem. O vínculo é individual: cada empresa conecta uma loja por vez.
          </CardDescription>
        </div>
        <a
          href="https://developer.aiqfome.com/docs/guides/opendelivery/authentication"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-portal hover:underline"
        >
          Guia oficial do aiqfome <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </CardHeader>

      <CardContent className="space-y-4">
        <ol className="grid gap-3 md:grid-cols-2">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex min-w-0 gap-3 rounded-xl border border-border/70 bg-muted/20 p-3"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-portal text-xs font-bold text-white">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-portal-deep">{step.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            operationalReady
              ? 'border-status-entregue/30 bg-status-entregue/8 text-status-entregue'
              : 'border-colete/30 bg-colete/8 text-portal-deep'
          }`}
          role="status"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{status.title}</p>
            <p className="mt-0.5 text-xs opacity-85">{status.description}</p>
          </div>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Se a opção de vínculo ainda não aparecer no Geraldo, confirme se o ID Magalu da loja já
          foi ativado e se o MOTOboyCity foi liberado pelo aiqfome para essa unidade. Você não
          precisa copiar tokens, códigos ou URLs de webhook: o retorno e a ativação são automáticos.
        </p>
      </CardContent>
    </Card>
  );
}
