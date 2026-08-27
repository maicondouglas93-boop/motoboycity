import type { Metadata } from 'next';
import { LEGAL_CONTACT_EMAIL, LegalPage, type LegalSection } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Termos de Uso | MOTOboyCity',
  description: 'Termos aplicáveis ao uso da plataforma de entregas MOTOboyCity.',
};

const sections: LegalSection[] = [
  {
    id: 'aceitacao',
    title: 'Aceitação e alcance',
    content: (
      <>
        <p>
          Estes Termos regulam o acesso e o uso da plataforma MOTOboyCity por empresas, integrantes
          de suas equipes e entregadores parceiros. Ao criar uma conta, aceitar um convite, conectar
          uma loja ou utilizar os aplicativos, o usuário declara que leu e concorda com este
          documento e com a Política de Privacidade.
        </p>
        <p>
          Quem utiliza a plataforma em nome de uma empresa declara possuir poderes para aceitar
          estes Termos e realizar operações em nome dela.
        </p>
      </>
    ),
  },
  {
    id: 'servico',
    title: 'O serviço MOTOboyCity',
    content: (
      <>
        <p>
          A MOTOboyCity fornece tecnologia para cadastrar, distribuir, acompanhar e registrar
          entregas. A plataforma aproxima empresas que precisam de transporte local e entregadores
          independentes disponíveis, além de oferecer recursos de despacho, localização, histórico,
          faturamento e comunicação operacional.
        </p>
        <p>
          A MOTOboyCity não vende os produtos transportados e não substitui a empresa nas relações
          comerciais mantidas com seus clientes. A disponibilização da tecnologia, por si só, não
          altera a natureza jurídica das relações existentes entre empresas e entregadores.
        </p>
      </>
    ),
  },
  {
    id: 'cadastro',
    title: 'Cadastro e segurança da conta',
    content: (
      <ul>
        <li>Os dados cadastrais devem ser verdadeiros, completos e mantidos atualizados.</li>
        <li>A conta e a senha são pessoais; credenciais não devem ser compartilhadas.</li>
        <li>
          A empresa é responsável por definir quem pode integrar sua equipe e por revogar acessos
          que deixarem de ser necessários.
        </li>
        <li>
          Suspeitas de acesso indevido, perda do aparelho ou comprometimento da senha devem ser
          comunicadas imediatamente pelo canal oficial de atendimento.
        </li>
      </ul>
    ),
  },
  {
    id: 'empresas',
    title: 'Responsabilidades das empresas',
    content: (
      <>
        <p>A empresa que solicita uma entrega se compromete a:</p>
        <ul>
          <li>informar corretamente coleta, destino, destinatário e particularidades da carga;</li>
          <li>
            obter e compartilhar dados de clientes apenas quando houver fundamento jurídico e
            necessidade para a entrega;
          </li>
          <li>
            não solicitar transporte de itens proibidos, ilícitos, perigosos ou incompatíveis;
          </li>
          <li>embalar e disponibilizar o item em condições adequadas para coleta;</li>
          <li>pagar as entregas, adicionais e demais valores apresentados na plataforma;</li>
          <li>acompanhar cancelamentos, ocorrências e solicitações de confirmação.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'entregadores',
    title: 'Responsabilidades dos entregadores',
    content: (
      <>
        <p>O entregador parceiro deve:</p>
        <ul>
          <li>manter habilitação, veículo, documentos e equipamentos legalmente exigidos;</li>
          <li>respeitar as regras de trânsito e conduzir com segurança;</li>
          <li>
            aceitar apenas entregas que possa cumprir e seguir a sequência operacional indicada;
          </li>
          <li>preservar o item, a privacidade e os dados do destinatário;</li>
          <li>
            manter localização e conexão disponíveis durante a operação, quando necessárias para o
            despacho, a segurança e o rastreamento;
          </li>
          <li>registrar ocorrências e conclusões de forma verdadeira.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'aiqfome',
    title: 'Integração com o aiqfome',
    content: (
      <>
        <p>
          Quando a loja ativa a integração, ela autoriza a MOTOboyCity a consultar os dados da loja
          e dos pedidos necessários à entrega e a enviar atualizações logísticas ao aiqfome. A
          autorização é individual por estabelecimento e pode ser revogada pelo lojista.
        </p>
        <p>
          A integração logística não autoriza a MOTOboyCity a alterar cardápio, catálogo, produtos
          ou preços. A desconexão impede novas sincronizações, mas não elimina automaticamente
          registros que precisem ser conservados para concluir entregas, faturamento, auditoria ou
          cumprimento de obrigações legais.
        </p>
      </>
    ),
  },
  {
    id: 'precos',
    title: 'Preços, adicionais e faturamento',
    content: (
      <>
        <p>
          O valor da entrega segue as regras comerciais vigentes para a empresa e pode considerar
          distância, modalidade, retorno, região e adicionais operacionais, como condições
          climáticas ou horários específicos. Quando o destino é definido por GPS durante a
          operação, o valor final pode depender da distância efetivamente registrada.
        </p>
        <p>
          Entregas faturadas são agrupadas conforme a configuração de fechamento da empresa. Atrasos
          podem gerar avisos, restrições de uso ou bloqueio, de acordo com a configuração contratada
          e a legislação aplicável.
        </p>
      </>
    ),
  },
  {
    id: 'localizacao',
    title: 'Localização e rastreamento',
    content: (
      <>
        <p>
          Durante entregas ativas, a localização do entregador pode ser utilizada para presença na
          fila, distribuição de pedidos, acompanhamento operacional, cálculo de distância, segurança
          e rastreamento em tempo real.
        </p>
        <p>
          A empresa pode gerar e compartilhar com o destinatário um link temporário de rastreamento.
          Quem receber o link deverá preservá-lo, pois ele permite consultar o status e, durante o
          trajeto, a posição vinculada à entrega.
        </p>
      </>
    ),
  },
  {
    id: 'uso-proibido',
    title: 'Usos proibidos',
    content: (
      <ul>
        <li>praticar fraude, falsidade, assédio, discriminação ou atividade ilegal;</li>
        <li>interferir na segurança, disponibilidade ou integridade da plataforma;</li>
        <li>automatizar acesso, copiar dados ou explorar falhas sem autorização;</li>
        <li>usar dados de clientes, empresas ou entregadores para finalidade alheia à entrega;</li>
        <li>ceder, revender ou sublicenciar o acesso à plataforma sem autorização.</li>
      </ul>
    ),
  },
  {
    id: 'disponibilidade',
    title: 'Disponibilidade e serviços de terceiros',
    content: (
      <>
        <p>
          A operação depende de internet, GPS, mapas, notificações, serviços de nuvem e plataformas
          integradas. Interrupções, manutenção, indisponibilidade de terceiros ou condições fora do
          controle razoável da MOTOboyCity podem afetar temporariamente algumas funções.
        </p>
        <p>
          A MOTOboyCity empregará esforços razoáveis para manter e restabelecer o serviço, sem
          garantir disponibilidade ininterrupta ou ausência absoluta de erros.
        </p>
      </>
    ),
  },
  {
    id: 'suspensao',
    title: 'Suspensão e encerramento',
    content: (
      <p>
        O acesso poderá ser limitado ou suspenso em caso de inadimplência, risco de segurança,
        suspeita de fraude, documentos inválidos, violação destes Termos ou obrigação legal. Sempre
        que possível e adequado ao risco, o usuário será informado e poderá regularizar a situação.
        O encerramento não afasta valores pendentes, deveres de confidencialidade, auditoria e
        obrigações relacionadas a entregas já realizadas.
      </p>
    ),
  },
  {
    id: 'responsabilidade',
    title: 'Responsabilidade e ocorrências',
    content: (
      <p>
        Cada participante responde por seus próprios atos e pelas informações que fornece. Eventuais
        perdas, avarias, atrasos, acidentes ou divergências serão analisados conforme os registros
        da operação, a participação de cada parte, o contrato comercial e a legislação aplicável.
        Nada nestes Termos exclui direitos ou responsabilidades que não possam ser afastados por
        lei.
      </p>
    ),
  },
  {
    id: 'privacidade',
    title: 'Privacidade e propriedade intelectual',
    content: (
      <>
        <p>
          O tratamento de dados pessoais é descrito na{' '}
          <a href="/politica-de-privacidade">Política de Privacidade</a>, que integra estes Termos.
        </p>
        <p>
          Marcas, interfaces, textos, software e demais elementos da MOTOboyCity permanecem
          protegidos pela legislação aplicável. O acesso concedido é limitado, revogável e destinado
          exclusivamente ao uso regular do serviço.
        </p>
      </>
    ),
  },
  {
    id: 'alteracoes-contato',
    title: 'Alterações, legislação e contato',
    content: (
      <>
        <p>
          Estes Termos podem ser atualizados para refletir mudanças no serviço, na legislação ou em
          requisitos de segurança. Alterações relevantes serão comunicadas pelos canais disponíveis,
          e a data da versão vigente permanecerá indicada no início da página.
        </p>
        <p>
          Aplica-se a legislação brasileira. Dúvidas podem ser encaminhadas pelo canal operacional
          disponibilizado no cadastro ou pelo e-mail{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </>
    ),
  },
];

export default function TermsOfUsePage() {
  return (
    <LegalPage
      kind="terms"
      title="Termos de Uso"
      summary="Regras para empresas, equipes e entregadores utilizarem a plataforma de forma segura, transparente e responsável."
      updatedAt="27 de agosto de 2026"
      sections={sections}
    />
  );
}
