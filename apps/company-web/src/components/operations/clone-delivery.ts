import type {
  CustomerPaymentMethod,
  OperationalDeliveryItem,
  ServiceTypeItem,
} from '@motoboycity/types';
import type { SelectedGoogleAddress } from './google-address-autocomplete';

/**
 * O que o formulário recebe ao clonar um pedido.
 *
 * Uma loja com ~8,5 entregas por dia sai sempre do mesmo lugar e repete muito
 * cliente. Clonar existe para poupar a redigitação — não para duplicar o
 * pedido inteiro, e a diferença entre as duas coisas está nas decisões abaixo.
 */
export interface CloneSeed {
  serviceTypeId: string;
  destinationKnown: boolean;
  requiresReturn: boolean;
  recipientName: string;
  recipientPhone: string;
  customerPaymentMethod: CustomerPaymentMethod | '';
  driverNote: string;
  addressSearch: string;
  address: SelectedGoogleAddress | null;
  number: string;
  complement: string;
  referenceNote: string;
  /** O que não veio junto, para a tela poder dizer em vez de falhar calada. */
  warnings: string[];
}

function enderecoCompleto(address: {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
}): boolean {
  return Boolean(
    address.street &&
    address.city &&
    address.state &&
    address.zip &&
    address.lat !== null &&
    address.lng !== null,
  );
}

/**
 * Monta o rascunho a partir de um pedido já existente.
 *
 * @param source      o pedido que está sendo repetido
 * @param serviceTypes as modalidades ativas hoje, para validar a do original
 */
export function buildCloneSeed(
  source: OperationalDeliveryItem,
  serviceTypes: ServiceTypeItem[],
): CloneSeed {
  const warnings: string[] = [];

  /**
   * A modalidade do original pode ter sido desativada desde então. Preselecionar
   * um id que não está mais na lista deixaria o campo em branco sem explicar
   * por quê, então aqui isso vira aviso e o campo cai no padrão.
   */
  const serviceTypeAindaAtiva = serviceTypes.some((item) => item.id === source.serviceTypeId);
  if (!serviceTypeAindaAtiva) {
    warnings.push(`A modalidade "${source.serviceTypeName}" não está mais ativa — escolha outra.`);
  }

  const dropoff = source.addresses.find((address) => address.type === 'DROPOFF') ?? null;

  /**
   * O endereço só é reaproveitado com coordenadas.
   *
   * O formulário exige uma sugestão escolhida no Google justamente porque o
   * despacho mede distância pelo par lat/lng. Copiar rua e número sem as
   * coordenadas montaria um destino que parece completo e falha no cálculo —
   * é mais honesto pedir que a pessoa reescolha.
   */
  let address: SelectedGoogleAddress | null = null;
  if (source.destinationKnownAtCreation && dropoff) {
    if (enderecoCompleto(dropoff)) {
      address = {
        label: `${dropoff.street}, ${dropoff.number ?? 's/n'} — ${dropoff.city}/${dropoff.state}`,
        street: dropoff.street!,
        number: dropoff.number ?? '',
        city: dropoff.city!,
        state: dropoff.state!,
        zip: dropoff.zip!,
        lat: dropoff.lat!,
        lng: dropoff.lng!,
      };
    } else {
      warnings.push('O destino do pedido original não tem coordenadas — selecione-o de novo.');
    }
  }

  return {
    serviceTypeId: serviceTypeAindaAtiva ? source.serviceTypeId : '',
    destinationKnown: source.destinationKnownAtCreation,
    requiresReturn: source.requiresReturn,
    recipientName: source.recipientName ?? '',
    recipientPhone: source.recipientPhone ?? '',
    customerPaymentMethod: source.customerPaymentMethod ?? '',
    driverNote: source.driverNote ?? '',
    addressSearch: address?.label ?? '',
    address,
    number: address?.number ?? '',
    complement: dropoff?.complement ?? '',
    referenceNote: dropoff?.referenceNote ?? '',
    /**
     * `externalOrderNumber` fica de fora de propósito: ele identifica UM pedido
     * no sistema da própria loja. Copiá-lo criaria duas entregas alegando ser o
     * mesmo pedido, e é justamente por esse número que a loja concilia depois.
     */
    warnings,
  };
}
