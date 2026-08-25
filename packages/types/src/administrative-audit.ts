export type AdministrativeAuditSource = 'ADMIN' | 'DELIVERY_HISTORY' | 'INVOICE_HISTORY';

export interface AdministrativeAuditEvent {
  id: string;
  source: AdministrativeAuditSource;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  actor: { id: string; name: string };
  createdAt: string;
}
