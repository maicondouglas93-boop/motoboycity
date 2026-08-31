import { z } from 'zod';

export const asaasCustomerSchema = z.object({ id: z.string().min(1) }).passthrough();

export const asaasCustomerListSchema = z
  .object({ data: z.array(asaasCustomerSchema) })
  .passthrough();

export const asaasPaymentSchema = z
  .object({
    id: z.string().min(1),
    customer: z.string().min(1),
    value: z.number().finite().nonnegative(),
    status: z.string().min(1),
    billingType: z.string().min(1),
    externalReference: z.string().nullable().optional(),
  })
  .passthrough();

export const asaasPaymentListSchema = z
  .object({ data: z.array(asaasPaymentSchema) })
  .passthrough();

export const asaasPixQrCodeSchema = z
  .object({
    encodedImage: z.string().min(1),
    payload: z.string().min(1),
    expirationDate: z.string().min(1),
  })
  .passthrough();

export const asaasWebhookEnvelopeSchema = z
  .object({
    id: z.string().min(1).max(120),
    event: z.string().min(1).max(80),
    payment: z
      .object({
        id: z.string().min(1).max(120),
        customer: z.string().min(1),
        value: z.number().finite().nonnegative(),
        status: z.string().min(1),
        billingType: z.string().min(1),
        externalReference: z.string().nullable().optional(),
        paymentDate: z.string().optional(),
        clientPaymentDate: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type AsaasWebhookEnvelope = z.infer<typeof asaasWebhookEnvelopeSchema>;
