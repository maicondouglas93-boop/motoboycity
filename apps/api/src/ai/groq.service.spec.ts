import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Groq from 'groq-sdk';
import { GroqService } from './groq.service';

class TestGroqService extends GroqService {
  constructor(
    config: ConfigService,
    private readonly createCompletion: jest.Mock,
  ) {
    super(config);
  }

  protected override createClient(): Groq {
    return {
      chat: { completions: { create: this.createCompletion } },
    } as unknown as Groq;
  }
}

const completion = (message: Record<string, unknown>) => ({
  choices: [{ message }],
});

describe('GroqService', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('falha de forma controlada quando a chave não está configurada', async () => {
    const service = new TestGroqService(new ConfigService({}), jest.fn());

    await expect(
      service.answer({
        message: 'Resumo de hoje',
        history: [],
        declarations: [],
        executeTool: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('executa a ferramenta obrigatória e devolve a resposta final', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce(
        completion({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'consultar_operacao_atual', arguments: '{}' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        completion({ role: 'assistant', content: 'Há 2 pedidos ativos.', tool_calls: [] }),
      );
    const executeTool = jest.fn().mockResolvedValue({ activeCount: 2 });
    const service = new TestGroqService(
      new ConfigService({ GROQ_API_KEY: 'test-key' }),
      create,
    );

    const result = await service.answer({
      message: 'Quantos pedidos estão ativos?',
      history: [],
      declarations: [
        {
          name: 'consultar_operacao_atual',
          description: 'Consulta a operação atual.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      ],
      executeTool,
    });

    expect(result).toEqual({
      answer: 'Há 2 pedidos ativos.',
      executions: [
        { name: 'consultar_operacao_atual', args: {}, result: { activeCount: 2 } },
      ],
    });
    expect(executeTool).toHaveBeenCalledWith('consultar_operacao_atual', {});
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tool_choice: 'required', parallel_tool_calls: false }),
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tool_choice: 'auto',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'tool',
            tool_call_id: 'call-1',
            content: JSON.stringify({ output: { activeCount: 2 } }),
          }),
        ]),
      }),
    );
  });

  it('rejeita argumentos de ferramenta que não sejam JSON válido', async () => {
    const create = jest.fn().mockResolvedValue(
      completion({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'consultar_operacao_atual', arguments: '{invalido' },
          },
        ],
      }),
    );
    const executeTool = jest.fn();
    const service = new TestGroqService(
      new ConfigService({ GROQ_API_KEY: 'test-key' }),
      create,
    );

    await expect(
      service.answer({
        message: 'Mostre a operação.',
        history: [],
        declarations: [
          {
            name: 'consultar_operacao_atual',
            description: 'Consulta a operação atual.',
            parameters: { type: 'object', properties: {} },
          },
        ],
        executeTool,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('converte limite de uso do provedor em indisponibilidade temporária', async () => {
    const providerError = Object.assign(new Error('upstream'), { status: 429 });
    const service = new TestGroqService(
      new ConfigService({ GROQ_API_KEY: 'test-key' }),
      jest.fn().mockRejectedValue(providerError),
    );

    await expect(
      service.answer({
        message: 'Resumo de hoje',
        history: [],
        declarations: [],
        executeTool: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('converte timeout do SDK em gateway timeout', async () => {
    const providerError = new Error('upstream');
    providerError.name = 'APIConnectionTimeoutError';
    const service = new TestGroqService(
      new ConfigService({ GROQ_API_KEY: 'test-key' }),
      jest.fn().mockRejectedValue(providerError),
    );

    await expect(
      service.answer({
        message: 'Resumo de hoje',
        history: [],
        declarations: [],
        executeTool: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
  });
});
