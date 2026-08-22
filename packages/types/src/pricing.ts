export interface ServiceTypeItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface PricingTableItem {
  id: string;
  regionId: string;
  serviceTypeId: string;
  serviceTypeName: string;
  baseFee: number;
  /** Distância coberta pela taxa base; o perKmFee só incide acima dela. */
  includedDistanceKm: number;
  perKmFee: number;
  minimumFee: number | null;
  returnFee: number | null;
  active: boolean;
  createdAt: string;
}

/**
 * `null` em qualquer um dos três significa "ainda não configurado pelo admin".
 * Nenhum cálculo assume valor padrão: precificar um pedido exige a comissão,
 * despachar exige o timeout e fechar um retorno exige o raio.
 */
export interface PlatformSettingsItem {
  driverCommissionPercentage: number | null;
  dispatchOfferTimeoutSeconds: number | null;
  returnProximityRadiusMeters: number | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
}

/**
 * Espelha `updatePlatformSettingsSchema`: atualização parcial, ao menos um
 * campo. Não aceita `null` — limpar um valor já configurado não é uma
 * operação suportada, já que isso pararia a operação da plataforma.
 */
export interface UpdatePlatformSettingsInput {
  driverCommissionPercentage?: number;
  dispatchOfferTimeoutSeconds?: number;
  returnProximityRadiusMeters?: number;
}
