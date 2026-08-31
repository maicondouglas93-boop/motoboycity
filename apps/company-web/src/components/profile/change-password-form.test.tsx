import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './change-password-form';

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  getToken: vi.fn<() => string | null>(),
  clearToken: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/lib/api-client', () => ({
  companyProfileApi: { changePassword: mocks.changePassword },
}));

vi.mock('@/lib/session', () => ({
  session: { getToken: mocks.getToken, clearToken: mocks.clearToken },
}));

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ChangePasswordForm token="token-atual" />
    </QueryClientProvider>,
  );
}

async function fillValidForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Senha atual'), 'senhaAtual123');
  await user.type(screen.getByLabelText('Nova senha'), 'senhaNova123');
  await user.type(screen.getByLabelText('Confirmar nova senha'), 'senhaNova123');
  return user;
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    mocks.changePassword.mockReset().mockResolvedValue({ changed: true });
    mocks.getToken.mockReset().mockReturnValue('token-atual');
    mocks.clearToken.mockReset();
    mocks.replace.mockReset();
  });

  it('valida tamanho e confirmacao antes de chamar a API', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Senha atual'), 'senhaAtual123');
    await user.type(screen.getByLabelText('Nova senha'), 'curta');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'diferente');
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(screen.getByText('A nova senha deve ter pelo menos 8 caracteres.')).toBeVisible();
    expect(screen.getByText('A confirmação deve ser igual à nova senha.')).toBeVisible();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it('troca a senha, limpa a sessao e direciona para um novo login', async () => {
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    await waitFor(() =>
      expect(mocks.changePassword).toHaveBeenCalledWith('token-atual', {
        currentPassword: 'senhaAtual123',
        newPassword: 'senhaNova123',
      }),
    );
    expect(mocks.clearToken).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith('/login?passwordChanged=1');
  });

  it('mostra a recusa da API sem encerrar a sessao', async () => {
    mocks.changePassword.mockRejectedValue(
      new ApiError(403, { message: 'A senha atual está incorreta.' }),
    );
    renderForm();
    const user = await fillValidForm();

    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByText('A senha atual está incorreta.')).toBeVisible();
    expect(mocks.clearToken).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
