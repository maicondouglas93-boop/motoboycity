import type { Metadata } from 'next';
import { LEGAL_CONTACT_EMAIL, LegalPage, type LegalSection } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Política de Privacidade | MOTOboyCity',
  description: 'Como a MOTOboyCity coleta, utiliza, compartilha e protege dados pessoais.',
};

const sections: LegalSection[] = [
  {
    id: 'sobre',
    title: 'Sobre esta política',
    content: (
      <>
        <p>
          Esta Política explica como a MOTOboyCity trata dados pessoais em seus painéis web,
          aplicativo do entregador, APIs, rastreamento público, atendimento e integrações. Ela se
          aplica a representantes e equipes de empresas, entregadores, destinatários e pessoas que
          interagem com a plataforma.
        </p>
        <p>
          Conforme a atividade, a MOTOboyCity poderá atuar como controladora, quando define as
          finalidades essenciais do tratamento, ou como operadora, quando trata dados seguindo
          instruções documentadas de uma empresa contratante.
        </p>
      </>
    ),
  },
  {
    id: 'dados',
    title: 'Dados que tratamos',
    content: (
      <ul>
        <li>
          <strong>Cadastro e identidade:</strong> nome, e-mail, telefone, CPF ou CNPJ, razão social,
          nome fantasia, data de nascimento, foto e documentos de habilitação ou veículo, conforme o
          perfil.
        </li>
        <li>
          <strong>Operação de entrega:</strong> endereços, coordenadas, nome e telefone do
          destinatário, número externo, observações, modalidade, ocorrências, horários, status e
          histórico.
        </li>
        <li>
          <strong>Localização:</strong> latitude, longitude, precisão e horário das posições do
          entregador durante presença operacional e entregas ativas.
        </li>
        <li>
          <strong>Financeiro:</strong> valores de entregas, faturas, carteira, solicitações de
          saque, chave PIX e registros necessários à conciliação e auditoria.
        </li>
        <li>
          <strong>Dispositivo e segurança:</strong> versão do aplicativo, identificadores de push,
          registros de acesso, falhas, data e hora de ações e outras evidências técnicas geradas
          pela infraestrutura.
        </li>
        <li>
          <strong>Atendimento:</strong> mensagens, solicitações, documentos e informações fornecidas
          para resolver dúvidas ou incidentes.
        </li>
      </ul>
    ),
  },
  {
    id: 'origem',
    title: 'Como obtemos os dados',
    content: (
      <p>
        Os dados podem ser fornecidos diretamente pelo titular, pela empresa que solicita a entrega,
        por integrantes autorizados da equipe, pelo dispositivo do entregador, por registros gerados
        durante o serviço ou por plataformas conectadas, como o aiqfome. A empresa que cadastra
        dados de destinatários deve fazê-lo de forma legítima e limitada ao necessário para a
        entrega.
      </p>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para que utilizamos os dados',
    content: (
      <ul>
        <li>criar contas, validar perfis, autenticar usuários e prevenir acessos indevidos;</li>
        <li>receber, precificar, distribuir, executar e comprovar entregas;</li>
        <li>mostrar localização, estimativas, histórico e status às partes autorizadas;</li>
        <li>
          emitir faturas, calcular repasses, processar solicitações financeiras e auditar valores;
        </li>
        <li>enviar alertas, ofertas, notificações e comunicações operacionais;</li>
        <li>integrar pedidos e sincronizar eventos com serviços autorizados pela loja;</li>
        <li>atender solicitações, investigar incidentes, combater fraude e proteger direitos;</li>
        <li>cumprir obrigações legais, regulatórias, judiciais e contratuais;</li>
        <li>produzir métricas agregadas e melhorar segurança, desempenho e usabilidade.</li>
      </ul>
    ),
  },
  {
    id: 'bases-legais',
    title: 'Bases legais',
    content: (
      <p>
        O tratamento poderá se apoiar na execução de contrato e de procedimentos preliminares, no
        cumprimento de obrigação legal ou regulatória, no exercício regular de direitos, na proteção
        da vida ou da incolumidade física, na prevenção à fraude, em interesses legítimos avaliados
        conforme os direitos do titular e, quando necessário, no consentimento. A base aplicável
        depende da finalidade, do dado e da relação mantida com o titular.
      </p>
    ),
  },
  {
    id: 'localizacao',
    title: 'Localização do entregador',
    content: (
      <>
        <p>
          A localização precisa pode ser coletada enquanto o entregador está online e durante
          entregas ativas, inclusive em segundo plano quando autorizado no aparelho. Ela é
          necessária para presença, elegibilidade na fila, despacho, acompanhamento, cálculo de
          rota, segurança e comprovação operacional.
        </p>
        <p>
          Os pontos históricos vinculados às entregas são mantidos por até <strong>30 dias</strong>{' '}
          e depois eliminados pelo processo automático de retenção, ressalvada eventual conservação
          necessária para investigação, defesa de direitos ou obrigação legal.
        </p>
      </>
    ),
  },
  {
    id: 'rastreamento-publico',
    title: 'Rastreamento compartilhado',
    content: (
      <p>
        A empresa pode gerar um link temporário e enviá-lo ao destinatário. O link apresenta somente
        o estado da entrega, o horário da atualização e a posição operacional mais recente quando o
        trajeto permite rastreamento. Ele não exibe telefone, e-mail ou histórico completo do
        entregador. O acesso expira quando a entrega é concluída ou cancelada. Quem recebe o link
        deve evitar repassá-lo a terceiros.
      </p>
    ),
  },
  {
    id: 'aiqfome',
    title: 'Dados da integração aiqfome',
    content: (
      <>
        <p>
          Quando a integração estiver ativada, a MOTOboyCity receberá os identificadores da loja e
          do pedido, dados do destinatário e do endereço, informações logísticas, horários,
          observações e os tokens necessários à conexão autorizada. O acesso é individual por
          estabelecimento.
        </p>
        <p>
          Esses dados serão usados para importar a entrega, evitar duplicidades, acompanhar sua
          execução, reconciliar eventos e devolver status logísticos. A MOTOboyCity não utilizará a
          autorização logística para modificar cardápio, catálogo, produtos ou preços.
        </p>
      </>
    ),
  },
  {
    id: 'asaas',
    title: 'Pagamento de faturas pelo Asaas',
    content: (
      <>
        <p>
          Quando a empresa optar por pagar uma fatura por PIX, a MOTOboyCity poderá compartilhar
          com o Asaas nome empresarial ou nome fantasia, CPF ou CNPJ, e-mail, telefone, valor,
          vencimento e uma referência interna da cobrança. Receberemos identificadores e eventos
          necessários para gerar o QR Code, confirmar o pagamento, evitar duplicidade e manter a
          auditoria financeira.
        </p>
        <p>
          O Asaas atua como provedor de pagamento e também trata os dados conforme sua própria{' '}
          <a
            href="https://central.ajuda.asaas.com/hc/pt-br/articles/32098003163035-Pol%C3%ADtica-de-Privacidade"
            target="_blank"
            rel="noreferrer"
          >
            Política de Privacidade
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: 'compartilhamento',
    title: 'Com quem compartilhamos',
    content: (
      <>
        <p>Dados são compartilhados apenas quando necessários, inclusive com:</p>
        <ul>
          <li>empresa solicitante, membros autorizados e entregador responsável;</li>
          <li>destinatário que recebeu legitimamente um link de rastreamento;</li>
          <li>aiqfome e outras integrações expressamente autorizadas pela empresa;</li>
          <li>Asaas, quando a empresa gerar ou pagar uma cobrança PIX de fatura;</li>
          <li>
            provedores de mapas, rotas, hospedagem, banco de dados, cache, notificações e
            comunicação;
          </li>
          <li>consultores e fornecedores sujeitos a deveres de confidencialidade e segurança;</li>
          <li>
            autoridades públicas, judiciais ou regulatórias, quando houver obrigação ou fundamento.
          </li>
        </ul>
        <p>
          Ao escolher compartilhar uma mensagem pelo WhatsApp, o usuário é direcionado ao serviço e
          decide confirmar o envio. O tratamento posterior também segue os termos e políticas do
          WhatsApp.
        </p>
      </>
    ),
  },
  {
    id: 'transferencia',
    title: 'Armazenamento e transferências internacionais',
    content: (
      <p>
        A plataforma utiliza infraestrutura de tecnologia e fornecedores que podem armazenar ou
        processar dados no Brasil ou em outros países. Quando houver transferência internacional,
        serão adotadas medidas compatíveis com a LGPD, como avaliação do fornecedor, controles de
        acesso, compromissos contratuais e salvaguardas adequadas ao risco.
      </p>
    ),
  },
  {
    id: 'retencao',
    title: 'Retenção e eliminação',
    content: (
      <p>
        Mantemos dados somente pelo período necessário às finalidades informadas, à relação
        contratual, ao faturamento, à auditoria, à prevenção de fraude, ao exercício de direitos e
        às obrigações legais. Encerrada a necessidade, os dados serão eliminados, anonimizados ou
        conservados de forma restrita quando a lei permitir ou exigir. A exclusão da conta não apaga
        imediatamente registros financeiros, históricos e evidências que ainda precisem ser
        preservados.
      </p>
    ),
  },
  {
    id: 'seguranca',
    title: 'Segurança',
    content: (
      <p>
        Adotamos controles técnicos e administrativos proporcionais aos riscos, como autenticação,
        restrição de acesso por perfil, criptografia em trânsito, registro de operações, segregação
        de credenciais e rotinas de retenção. Nenhum sistema é absolutamente invulnerável; por isso,
        incidentes suspeitos devem ser comunicados pelo canal oficial assim que identificados.
      </p>
    ),
  },
  {
    id: 'armazenamento-local',
    title: 'Cookies e armazenamento local',
    content: (
      <p>
        Os painéis web utilizam armazenamento local estritamente necessário para manter a sessão e
        preferências operacionais. Não utilizamos esse recurso para publicidade comportamental. O
        bloqueio pelo navegador pode impedir o login ou comprometer funções essenciais. Se forem
        adicionados cookies ou tecnologias opcionais, esta Política será atualizada e o
        consentimento será solicitado quando exigido.
      </p>
    ),
  },
  {
    id: 'direitos',
    title: 'Direitos dos titulares',
    content: (
      <>
        <p>Nos termos da LGPD, o titular pode solicitar, conforme aplicável:</p>
        <ul>
          <li>confirmação do tratamento e acesso aos dados;</li>
          <li>correção de informações incompletas, inexatas ou desatualizadas;</li>
          <li>anonimização, bloqueio ou eliminação de dados inadequados ou excessivos;</li>
          <li>portabilidade, observadas a regulamentação e os segredos comercial e industrial;</li>
          <li>informações sobre compartilhamentos e consequências de eventual negativa;</li>
          <li>eliminação de dados tratados com consentimento e revogação do consentimento;</li>
          <li>
            oposição a tratamento irregular e revisão de decisões automatizadas, quando aplicável.
          </li>
        </ul>
        <p>
          O atendimento poderá exigir confirmação de identidade e não terá custo. Para orientação
          adicional, consulte a página oficial da{' '}
          <a
            href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares"
            target="_blank"
            rel="noreferrer"
          >
            Autoridade Nacional de Proteção de Dados
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: 'criancas',
    title: 'Crianças e adolescentes',
    content: (
      <p>
        As contas empresariais e de entregadores não são destinadas a crianças. Se dados de criança
        ou adolescente forem indispensáveis a uma entrega solicitada pelo responsável, deverão ser
        limitados ao mínimo necessário e tratados conforme seu melhor interesse e a legislação
        aplicável.
      </p>
    ),
  },
  {
    id: 'contato',
    title: 'Contato e atualizações',
    content: (
      <>
        <p>
          Solicitações de privacidade podem ser apresentadas pelo e-mail{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> ou pelo canal
          operacional disponibilizado no cadastro. Destinatários também podem iniciar a solicitação
          pela empresa responsável pelo pedido, que a encaminhará quando a MOTOboyCity for o agente
          competente.
        </p>
        <p>
          Esta Política poderá ser atualizada para refletir mudanças legais, operacionais ou
          tecnológicas. Alterações relevantes serão comunicadas pelos canais disponíveis,
          mantendo-se nesta página a data da versão vigente.
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      kind="privacy"
      title="Política de Privacidade"
      summary="Entenda quais dados usamos para operar as entregas, por que eles são necessários e como você pode exercer seus direitos."
      updatedAt="31 de agosto de 2026"
      sections={sections}
    />
  );
}
