'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AdminDriverDetail, DriverCompensation } from '@motoboycity/types';
import { BadgeDollarSign } from 'lucide-react';
import { adminDriversApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const OPCOES: Record<DriverCompensation, { titulo: string; detalhe: string }> = {
  PER_DELIVERY: {
    titulo: 'Por corrida',
    detalhe:
      'A parte do motoboy de cada entrega concluída vai para a carteira dele, e ele vê os valores no aplicativo.',
  },
  SALARIED: {
    titulo: 'Salário fixo',
    detalhe:
      'Contratado com salário, pago fora do sistema. As entregas dele ficam inteiras com a plataforma, nada entra na carteira, e o aplicativo não mostra valores a ele.',
  },
};

/**
 * Como o motoboy é pago. Vale para as entregas concluídas depois da troca: o
 * repasse é decidido na conclusão, e o que já está na carteira continua lá.
 */
export function DriverCompensationCard({
  driver,
  token,
}: {
  driver: Pick<AdminDriverDetail, 'id' | 'name' | 'compensation'>;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  // A API anterior à remuneração não manda o campo: todo motoboy era por corrida.
  const atual: DriverCompensation = driver.compensation ?? 'PER_DELIVERY';
  const outra: DriverCompensation = atual === 'SALARIED' ? 'PER_DELIVERY' : 'SALARIED';

  const trocar = useMutation({
    mutationFn: () => adminDriversApi.updateCompensation(token, driver.id, { compensation: outra }),
    onSuccess: (detalhe) => {
      queryClient.setQueryData(['admin', 'driver', driver.id], detalhe);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      setConfirmando(false);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeDollarSign className="size-4" aria-hidden="true" /> Remuneração
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="font-medium">{OPCOES[atual].titulo}</p>
          <p className="text-muted-foreground">{OPCOES[atual].detalhe}</p>
        </div>

        {!confirmando ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmando(true)}>
            Mudar para {OPCOES[outra].titulo.toLowerCase()}
          </Button>
        ) : (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p>
              {driver.name} passa a ser pago <strong>{OPCOES[outra].titulo.toLowerCase()}</strong>.{' '}
              {OPCOES[outra].detalhe} Vale para as entregas concluídas daqui em diante; o que já
              está na carteira continua lá.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={trocar.isPending}
                onClick={() => trocar.mutate()}
              >
                {trocar.isPending
                  ? 'Salvando...'
                  : `Confirmar: ${OPCOES[outra].titulo.toLowerCase()}`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={trocar.isPending}
                onClick={() => setConfirmando(false)}
              >
                Voltar
              </Button>
            </div>
          </div>
        )}

        {trocar.isError && (
          <p role="alert" className="text-destructive">
            {trocar.error instanceof ApiError
              ? trocar.error.message
              : 'Não foi possível mudar a remuneração.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
