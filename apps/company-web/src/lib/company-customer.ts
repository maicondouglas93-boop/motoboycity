import type {
  CompanyCustomer,
  CompanyCustomerAddress,
  CompanyCustomerSavedAddress,
  DeliveryAddressItem,
  DeliveryStatus,
  EnderecoDaEntrega,
} from '@motoboycity/types';
import { companyCustomerPhoneSchema } from '@motoboycity/validation';
import type { SelectedGoogleAddress } from '@/components/operations/google-address-autocomplete';

export interface DeliveryCustomerFields {
  customerId: string;
  recipientName: string;
  recipientPhone: string;
  addressSearch: string;
  address: SelectedGoogleAddress | null;
  number: string;
  complement: string;
  referenceNote: string;
}

export interface CustomerRegistrationPrefill {
  name: string;
  cpf?: string;
  phone: string;
  addressLabel?: string;
  address: CompanyCustomerAddress;
}

export interface CompletedDeliveryCustomerSource {
  batchId: string | null;
  destinationKnownAtCreation: boolean;
  status: DeliveryStatus;
  recipientName: string | null;
  recipientPhone: string | null;
  addresses: DeliveryAddressItem[];
}

export interface DeliveryCustomerCandidateSource {
  customerId: string | null;
  recipientName: string;
  recipientPhone: string;
  address: SelectedGoogleAddress | null;
  number: string;
  complement: string;
  referenceNote: string;
}

export function formatCustomerPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function formatCustomerCpf(cpf: string | null): string {
  if (!cpf) return 'Não informado';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCustomerAddress(address: CompanyCustomerAddress): string {
  return `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ''}, ${address.city}/${address.state}`;
}

export function customerToDeliveryFields(
  customer: CompanyCustomer,
  selectedAddress?: CompanyCustomerSavedAddress,
): DeliveryCustomerFields {
  const address =
    selectedAddress ?? customer.addresses.find((item) => item.isPrimary) ?? customer.address;
  return {
    customerId: customer.id,
    recipientName: customer.name,
    recipientPhone: customer.phone,
    addressSearch: formatCustomerAddress(address),
    address:
      address.lat !== null && address.lng !== null
        ? {
            label: formatCustomerAddress(address),
            street: address.street,
            number: address.number,
            city: address.city,
            state: address.state,
            zip: address.zip,
            lat: address.lat,
            lng: address.lng,
          }
        : null,
    number: address.number,
    complement: address.complement ?? '',
    referenceNote: address.referenceNote ?? '',
  };
}

export function buildCustomerRegistrationCandidates(
  drafts: DeliveryCustomerCandidateSource[],
): CustomerRegistrationPrefill[] {
  const uniquePhones = new Set<string>();
  return drafts.flatMap((draft) => {
    const normalizedPhone = draft.recipientPhone.replace(/\D/g, '');
    if (
      draft.customerId ||
      !draft.recipientName.trim() ||
      !normalizedPhone ||
      !draft.address ||
      uniquePhones.has(normalizedPhone)
    ) {
      return [];
    }
    uniquePhones.add(normalizedPhone);
    return [
      {
        name: draft.recipientName.trim(),
        phone: normalizedPhone,
        address: {
          street: draft.address.street,
          number: draft.number || draft.address.number,
          complement: draft.complement || null,
          city: draft.address.city,
          state: draft.address.state,
          zip: draft.address.zip,
          lat: draft.address.lat,
          lng: draft.address.lng,
          referenceNote: draft.referenceNote || null,
        },
      },
    ];
  });
}

/**
 * Reaproveita o snapshot imutavel de um pedido avulso cujo destino foi
 * capturado pelo motoboy. Rua, cidade, UF e CEP precisam ter sido resolvidos
 * pela API; o numero pode ser confirmado pela empresa no formulario.
 */
export function buildCompletedDeliveryCustomerPrefill(
  delivery: CompletedDeliveryCustomerSource,
): CustomerRegistrationPrefill | null {
  if (
    delivery.batchId !== null ||
    delivery.destinationKnownAtCreation ||
    (delivery.status !== 'DELIVERED' && delivery.status !== 'COMPLETED')
  ) {
    return null;
  }

  const name = delivery.recipientName?.trim() ?? '';
  const phone = delivery.recipientPhone
    ? companyCustomerPhoneSchema.safeParse(delivery.recipientPhone)
    : null;
  const dropoff = delivery.addresses.find((address) => address.type === 'DROPOFF');

  if (
    name.length < 2 ||
    !phone?.success ||
    !dropoff?.street?.trim() ||
    !dropoff.city?.trim() ||
    !dropoff.state?.trim() ||
    !dropoff.zip?.trim() ||
    dropoff.lat === null ||
    dropoff.lng === null
  ) {
    return null;
  }

  return {
    name,
    phone: phone.data,
    addressLabel: 'Destino da entrega',
    address: {
      street: dropoff.street.trim(),
      number: dropoff.number?.trim() ?? '',
      complement: dropoff.complement?.trim() || null,
      city: dropoff.city.trim(),
      state: dropoff.state.trim(),
      zip: dropoff.zip.trim(),
      lat: dropoff.lat,
      lng: dropoff.lng,
      referenceNote: dropoff.referenceNote?.trim() || null,
    },
  };
}

/** O que a venda da loja online traz do cliente: o que ele digitou no checkout. */
export interface StoreOrderCustomerSource {
  cliente: string;
  telefone: string;
  entrega: EnderecoDaEntrega | null;
}

/**
 * O cliente da loja online no formato do cadastro, com os dados do pedido.
 *
 * O cadastro não tem campo de bairro (a entrega também não): ele vai na
 * referência, como na corrida que nasce do pedido. Sem CEP ou UF no checkout,
 * valem os da loja — o cliente está na cidade dela, a mesma regra da corrida.
 * Retirada não tem endereço, e o cadastro exige um: `null`.
 */
export function buildStoreOrderCustomerPrefill(
  venda: StoreOrderCustomerSource,
  coleta: { zip: string; state: string } | null,
): CustomerRegistrationPrefill | null {
  const entrega = venda.entrega;
  const name = venda.cliente.trim();
  const phone = companyCustomerPhoneSchema.safeParse(venda.telefone);
  if (!entrega || name.length < 2 || !phone.success) return null;

  const bairro = entrega.bairro.trim();
  const referencia = [bairro ? `Bairro ${bairro}` : '', entrega.referencia?.trim() ?? '']
    .filter(Boolean)
    .join(' · ');
  return {
    name,
    phone: phone.data,
    addressLabel: bairro.slice(0, 40) || 'Principal',
    address: {
      street: entrega.rua.trim(),
      number: entrega.numero.trim(),
      complement: entrega.complemento?.trim() || null,
      city: entrega.cidade.trim(),
      state: (entrega.estado.trim() || coleta?.state || '').toUpperCase(),
      zip: entrega.cep.replace(/\D/g, '') || coleta?.zip || '',
      lat: null,
      lng: null,
      referenceNote: referencia || null,
    },
  };
}

function comparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * O endereço já está salvo no cliente: mesma rua, número e cidade, sem olhar
 * acento, caixa e pontuação. O complemento fica de fora de propósito — "casa"
 * digitado no checkout não faz do endereço salvo sem complemento um outro lugar.
 */
export function customerHasAddress(
  customer: CompanyCustomer,
  address: Pick<CompanyCustomerAddress, 'street' | 'number' | 'city'>,
): boolean {
  const key = (item: Pick<CompanyCustomerAddress, 'street' | 'number' | 'city'>) =>
    [item.street, item.number, item.city].map(comparable).join('|');
  const target = key(address);
  return [customer.address, ...customer.addresses].some((item) => key(item) === target);
}

/** Um nome de endereço que o cliente ainda não usa: o servidor recusa repetido. */
export function unusedAddressLabel(customer: CompanyCustomer, wanted: string): string {
  const used = new Set(customer.addresses.map((address) => comparable(address.label)));
  const base = wanted.trim().slice(0, 36) || 'Endereço';
  if (!used.has(comparable(base))) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!used.has(comparable(candidate))) return candidate;
  }
}
