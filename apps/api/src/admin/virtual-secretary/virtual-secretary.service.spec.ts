import type { User } from '@prisma/client';
import type { GroqService } from '../../ai/groq.service';
import type { VirtualSecretaryAuditService } from './virtual-secretary-audit.service';
import { VirtualSecretaryService } from './virtual-secretary.service';
import type { VirtualSecretaryToolsService } from './virtual-secretary-tools.service';

describe('VirtualSecretaryService', () => {
  const user = { id: 'admin-1', type: 'ADMIN' } as User;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const tools = {
    execute: jest.fn().mockResolvedValue({
      parameters: { category: 'ACAO_NAO_PERMITIDA' },
      result: { message: 'Esta versão é somente leitura.' },
    }),
  };
  const groq = {
    answer: jest.fn().mockImplementation(async ({ executeTool }) => {
      await executeTool('responder_sem_consulta', { category: 'ACAO_NAO_PERMITIDA' });
      return {
        answer: 'Esta versão é somente leitura e não pode alterar dados.',
        executions: [],
      };
    }),
  };
  const service = new VirtualSecretaryService(
    groq as unknown as GroqService,
    tools as unknown as VirtualSecretaryToolsService,
    audit as unknown as VirtualSecretaryAuditService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('recusa ação de escrita por ferramenta sem executar mutação', async () => {
    const result = await service.chat(user, {
      message: 'Cancele o pedido 1163',
      history: [],
    });

    expect(result.answer).toContain('somente leitura');
    expect(tools.execute).toHaveBeenCalledWith(
      'responder_sem_consulta',
      { category: 'ACAO_NAO_PERMITIDA' },
      user,
    );
    expect(result.toolNames).toEqual(['responder_sem_consulta']);
  });

  it('audita somente metadados do chat, sem persistir o texto da conversa', async () => {
    await service.chat(user, { message: 'Mostre os pedidos de hoje', history: [] });

    const chatAudit = audit.record.mock.calls
      .map(([value]) => value)
      .find((value) => value.action === 'CHAT_REQUEST');
    expect(chatAudit.parameters).toEqual({ messageLength: 25, historyCount: 0 });
    expect(JSON.stringify(chatAudit)).not.toContain('Mostre os pedidos de hoje');
  });

  it('não persiste valores sensíveis dos parâmetros ou resultados das ferramentas', async () => {
    tools.execute.mockResolvedValueOnce({
      parameters: { query: 'cliente@example.com', phone: '33999999999' },
      result: { items: [{ email: 'cliente@example.com' }], summary: '33999999999' },
    });

    await service.chat(user, { message: 'Localize o cadastro', history: [] });

    const toolAudit = audit.record.mock.calls
      .map(([value]) => value)
      .find((value) => value.action === 'TOOL_EXECUTION');
    expect(toolAudit.parameters).toEqual({ keys: ['phone', 'query'] });
    expect(toolAudit.result).toEqual({ keys: ['items', 'summary'] });
    expect(JSON.stringify(toolAudit)).not.toContain('cliente@example.com');
    expect(JSON.stringify(toolAudit)).not.toContain('33999999999');
  });
});
