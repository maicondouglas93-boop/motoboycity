import type { DeliveryStatus } from './delivery';

export interface OperationsReportCompanyItem {
  companyId: string;
  companyName: string;
  createdCount: number;
  completedCount: number;
  cancelledCount: number;
  completedTotalValue: number;
  platformValue: number;
}

export interface OperationsReportDriverItem {
  driverId: string;
  driverName: string;
  driverEmail: string;
  completedCount: number;
  driverValue: number;
}

export interface OperationsReportServiceTypeItem {
  serviceTypeName: string;
  createdCount: number;
  completedCount: number;
  completedTotalValue: number;
}

export interface AdminOperationsReport {
  period: { from: string; to: string };
  ordersCreated: {
    count: number;
    byCurrentStatus: Record<DeliveryStatus, number>;
  };
  deliveriesCompleted: {
    count: number;
    totalValue: number;
    driverValue: number;
    platformValue: number;
    averageTicket: number;
  };
  companies: OperationsReportCompanyItem[];
  drivers: OperationsReportDriverItem[];
  serviceTypes: OperationsReportServiceTypeItem[];
}
