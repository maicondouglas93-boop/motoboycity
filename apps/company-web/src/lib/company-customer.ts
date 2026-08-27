import type { CompanyCustomer, CompanyCustomerAddress } from '@motoboycity/types';
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
  address: CompanyCustomerAddress;
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
  if (!cpf) return 'NÃ£o informado';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCustomerAddress(address: CompanyCustomerAddress): string {
  return `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ''}, ${address.city}/${address.state}`;
}

export function customerToDeliveryFields(customer: CompanyCustomer): DeliveryCustomerFields {
  return {
    customerId: customer.id,
    recipientName: customer.name,
    recipientPhone: customer.phone,
    addressSearch: formatCustomerAddress(customer.address),
    address:
      customer.address.lat !== null && customer.address.lng !== null
        ? {
            label: formatCustomerAddress(customer.address),
            street: customer.address.street,
            number: customer.address.number,
            city: customer.address.city,
            state: customer.address.state,
            zip: customer.address.zip,
            lat: customer.address.lat,
            lng: customer.address.lng,
          }
        : null,
    number: customer.address.number,
    complement: customer.address.complement ?? '',
    referenceNote: customer.address.referenceNote ?? '',
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
