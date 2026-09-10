import type { OperationalDeliveryItem } from '@motoboycity/types';
import { statusLabel } from './status-chip';
import styles from './delivery-receipt.module.css';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
});

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Não informado' : dateFormatter.format(parsed);
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <p className={styles['field']}>
      <strong>{label}: </strong>
      {value?.trim() || <span className={styles['blank']} aria-label="Preencher à mão" />}
    </p>
  );
}

/** Só dados operacionais do próprio pedido. Valores financeiros não compõem este cupom. */
export function DeliveryReceipt({ delivery, printedAt }: {
  delivery: OperationalDeliveryItem;
  printedAt: string;
}) {
  const destination = delivery.addresses.find((address) => address.type === 'DROPOFF');
  const assigned = ['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED', 'COMPLETED'].includes(delivery.status);
  const driver = assigned ? delivery.driver?.name?.trim() : null;

  return (
    <article className={styles['receipt']} aria-label={`Cupom do pedido #${delivery.displayNumber}`}>
      <header className={styles['heading']}>
        <p className={styles['store']}>{delivery.companyName}</p>
        <h1>PEDIDO #{delivery.displayNumber}</h1>
        <p>Entrega · {delivery.serviceTypeName}</p>
        <p>{date(delivery.createdAt)} (Brasília)</p>
        <p><strong>{statusLabel(delivery.status)}</strong></p>
      </header>

      {delivery.externalOrderNumber && <Field label="REFERÊNCIA DA LOJA" value={delivery.externalOrderNumber} />}
      {delivery.scheduledAt && <Field label="AGENDADO PARA" value={date(delivery.scheduledAt)} />}
      {delivery.requiresReturn && <p><strong>COM RETORNO À LOJA</strong></p>}

      <section className={styles['section']}>
        <h2>DESTINATÁRIO</h2>
        <Field label="CLIENTE" value={delivery.recipientName} />
        <Field label="TELEFONE" value={delivery.recipientPhone} />
      </section>

      <section className={styles['section']}>
        <h2>ENDEREÇO DE ENTREGA</h2>
        {!destination?.street && !delivery.destinationKnownAtCreation && (
          <p className={styles['hint']}>Destino definido na entrega. Preencha os dados conhecidos abaixo.</p>
        )}
        <Field label="RUA/AV." value={destination?.street} />
        <Field label="NÚMERO" value={destination?.number} />
        <Field label="COMPLEMENTO" value={destination?.complement} />
        {/* O contrato atual não possui bairro; nunca inferir a partir de outro campo. */}
        <Field label="BAIRRO" />
        <Field label="CIDADE/UF" value={[destination?.city, destination?.state].filter(Boolean).join(' / ')} />
        {destination?.zip && <Field label="CEP" value={destination.zip} />}
        <Field label="REFERÊNCIA" value={destination?.referenceNote} />
      </section>

      {delivery.driverNote?.trim() && (
        <section className={styles['section']}>
          <h2>OBSERVAÇÕES / INSTRUÇÕES</h2>
          <p className={styles['notes']}>{delivery.driverNote}</p>
        </section>
      )}

      <section className={`${styles['section']} ${styles['driver']}`}>
        <h2>MOTOBOY</h2>
        <p>{driver || (delivery.status === 'CANCELLED' || delivery.status === 'COMPLETED'
          ? 'Sem motoboy atribuído' : 'Aguardando motoboy')}</p>
      </section>

      <footer className={styles['footer']}>
        <Field label="CONFERIDO POR" />
        <p>IMPRESSO EM: {date(printedAt)} (Brasília)</p>
        <p>Cupom de entrega · Não é documento fiscal</p>
      </footer>
    </article>
  );
}
