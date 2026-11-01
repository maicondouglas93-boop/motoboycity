export interface PublicRegionItem {
  id: string;
  name: string;
}

export interface AdminRegion {
  id: string;
  name: string;
  maxDeliveryDistanceKm: number | null;
  active: boolean;
  companyCount: number;
  driverCount: number;
  createdAt: string;
}
