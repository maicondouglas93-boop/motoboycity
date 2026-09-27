import { useEffect, useState } from 'react';
import type { AuthUser } from '@motoboycity/types';
import { getDriverProfile, ultimoPerfilConhecido } from './driverProfileCache';
import { session } from './session';

/**
 * O motoboy de salario fixo nao ve valores no app: nem o da oferta, nem o das
 * entregas, nem historico ou carteira. A entrega dele fica inteira com a
 * plataforma, e o salario e pago fora do sistema.
 *
 * So `SALARIED` esconde: perfil sem o campo (API anterior a remuneracao) e
 * motoboy por corrida, como sempre foi.
 */
export function mostraValores(perfil: Pick<AuthUser, 'driverCompensation'>): boolean {
  return perfil.driverCompensation !== 'SALARIED';
}

/**
 * `true` quando o motoboy recebe por corrida e pode ver valores. Enquanto nenhum
 * perfil foi lido nesta sessao, esconde — mostrar e depois tirar seria mostrar.
 * O perfil e relido pelo cache (5 min): quem passar a salario fixo com o app
 * aberto deixa de ver valores na proxima leitura.
 */
export function useMostraValores(): boolean {
  const [mostra, setMostra] = useState<boolean | null>(() => {
    const perfil = ultimoPerfilConhecido();
    return perfil ? mostraValores(perfil) : null;
  });

  useEffect(() => {
    let ativo = true;
    (async () => {
      const token = await session.getToken();
      if (!token) return;
      const perfil = await getDriverProfile(token).catch(() => null);
      if (ativo && perfil) setMostra(mostraValores(perfil));
    })().catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  return mostra === true;
}
