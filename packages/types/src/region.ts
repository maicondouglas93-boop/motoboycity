export interface AdminRegion {
  id: string;
  name: string;
  maxDeliveryDistanceKm: number | null;
  active: boolean;
  companyCount: number;
  driverCount: number;
  createdAt: string;
}
