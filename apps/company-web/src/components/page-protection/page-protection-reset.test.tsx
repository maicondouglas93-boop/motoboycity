import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PageProtectionStatusItem } from '@motoboycity/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagePageProtectionsCard } from './manage-page-protections-card';
import { ResetPagePasswordDialog } from './reset-page-password-dialog';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getRecovery: vi.fn(),
  setRecovery: vi.fn(),
  updateProtection: vi.fn(),
  resetPassword: vi.fn(),
  setProtection: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ companyPageProtectionApi: mocks }));
vi.mock('@/lib/session', () => ({ session: { getToken: () => 'token-da-sessao' } }));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const financeiro: PageProtectionStatusItem = {
  routeKey: 'FINANCEIRO',
  label: 'Financeiro',
  path: '/financeiro',
  description: 'Extratos',
  enabled: true,
  hasProtection: true,
  updatedAt: '2026-10-05T10:00:00.000Z',
};

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([financeiro]);
  mocks.getRecovery.mockResolvedValue({
    configured: true,
    question: 'Nome do primeiro cachorro?',
    updatedAt: '2026-10-05T10:00:00.000Z',
  });
  mocks.resetPassword.mockResolvedValue(financeiro);
  mocks.updateProtection.mockResolvedValue({ ...financeiro, enabled: false });
});

describe('redefinir a senha esquecida', () => {
  it('pela senha de login manda a senha de login e a nova senha', async () => {
    const onReset = vi.fn();
    renderWithQuery(
      <ResetPagePasswordDialog page={financeiro} open onOpenChange={vi.fn()} onReset={onReset} />,
    );

    type('Senha de login do painel', 'senha-do-login');
    type('Nova senha da página', 'nova1234');
    type('Confirmar nova senha', 'nova1234');
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() =>
      expect(mocks.resetPassword).toHaveBeenCalledWith('token-da-sessao', 'FINANCEIRO', {
        method: 'ACCOUNT_PASSWORD',
        accountPassword: 'senha-do-login',
        newPassword: 'nova1234',
      }),
    );
    expect(onReset).toHaveBeenCalledWith(financeiro);
  });

  it('pela pergunta secreta mostra a pergunta cadastrada e manda a resposta', async () => {
    renderWithQuery(<ResetPagePasswordDialog page={financeiro} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Pergunta secreta' }));
    await screen.findByLabelText('Nome do primeiro cachorro?');
    type('Nome do primeiro cachorro?', 'Rex');
    type('Nova senha da página', 'nova1234');
    type('Confirmar nova senha', 'nova1234');
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() =>
      expect(mocks.resetPassword).toHaveBeenCalledWith('token-da-sessao', 'FINANCEIRO', {
        method: 'SECRET_ANSWER',
        secretAnswer: 'Rex',
        newPassword: 'nova1234',
      }),
    );
  });

  it('sem pergunta cadastrada, o caminho da resposta avisa e não envia', async () => {
    mocks.getRecovery.mockResolvedValue({ configured: false, question: null, updatedAt: null });
    renderWithQuery(<ResetPagePasswordDialog page={financeiro} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Pergunta secreta' }));

    expect(await screen.findByText(/ainda não cadastrou uma pergunta secreta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redefinir senha' })).toBeDisabled();
  });

  it('senhas diferentes não chegam à API', async () => {
    renderWithQuery(<ResetPagePasswordDialog page={financeiro} open onOpenChange={vi.fn()} />);

    type('Senha de login do painel', 'senha-do-login');
    type('Nova senha da página', 'nova1234');
    type('Confirmar nova senha', 'outra123');
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('não coincidem');
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });
});

describe('Configurações → Proteção de páginas', () => {
  it('desativar pede a senha atual e a envia', async () => {
    renderWithQuery(<ManagePageProtectionsCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));
    const confirmar = screen.getByRole('button', { name: 'Desativar proteção' });
    expect(confirmar).toBeDisabled();

    type('Senha atual da página', 'senha-certa');
    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(mocks.updateProtection).toHaveBeenCalledWith('token-da-sessao', 'FINANCEIRO', {
        enabled: false,
        currentPassword: 'senha-certa',
      }),
    );
  });

  it('"Esqueci a senha" no desativar leva à redefinição da mesma página', async () => {
    renderWithQuery(<ManagePageProtectionsCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci a senha' }));

    expect(screen.getByRole('heading', { name: 'Esqueci a senha' })).toBeInTheDocument();
    expect(screen.getByText(/Crie uma nova senha para/)).toHaveTextContent('Financeiro');
  });

  it('alterar a senha de uma proteção ativa também pede a atual', async () => {
    renderWithQuery(<ManagePageProtectionsCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Alterar senha' }));
    type('Senha atual da página', 'senha-certa');
    type('Nova senha', 'nova1234');
    type('Confirmar senha', 'nova1234');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() =>
      expect(mocks.updateProtection).toHaveBeenCalledWith('token-da-sessao', 'FINANCEIRO', {
        password: 'nova1234',
        enabled: true,
        currentPassword: 'senha-certa',
      }),
    );
  });

  it('cadastrar a pergunta secreta manda pergunta, resposta e senha de login', async () => {
    mocks.getRecovery.mockResolvedValue({ configured: false, question: null, updatedAt: null });
    mocks.setRecovery.mockResolvedValue({
      configured: true,
      question: 'Cidade onde nasci?',
      updatedAt: '2026-10-05T10:00:00.000Z',
    });
    renderWithQuery(<ManagePageProtectionsCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar pergunta' }));
    type('Pergunta', 'Cidade onde nasci?');
    type('Resposta', 'Lajinha');
    type('Senha de login do painel', 'senha-do-login');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar pergunta' }));

    await waitFor(() =>
      expect(mocks.setRecovery).toHaveBeenCalledWith('token-da-sessao', {
        accountPassword: 'senha-do-login',
        question: 'Cidade onde nasci?',
        answer: 'Lajinha',
      }),
    );
    expect(await screen.findByText(/Pergunta secreta salva/)).toBeInTheDocument();
  });
});
