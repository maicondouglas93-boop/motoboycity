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
  perKmFee: number;
  minimumFee: number | null;
  returnFee: number | null;
  active: boolean;
  createdAt: string;
}

export interface PlatformSettingsItem {
  driverCommissionPercentage: number | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
}
