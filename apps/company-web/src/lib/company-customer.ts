import type {
  CompanyCustomer,
  CompanyCustomerAddress,
  CompanyCustomerSavedAddress,
} from '@motoboycity/types';
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
