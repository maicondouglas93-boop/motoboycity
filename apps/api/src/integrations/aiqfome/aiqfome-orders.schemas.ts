import { z } from 'zod';

const providerIdSchema = z.union([z.string(), z.number()]).transform(String);

export const aiqfomeWebhookEventNameSchema = z.enum([
  'new-order',
  'read-order',
  'ready-order',
  'cancel-order',
  'order-refund',
]);

export const aiqfomeWebhookEnvelopeSchema = z
  .object({
    event: aiqfomeWebhookEventNameSchema,
    store_id: providerIdSchema,
    data: z
      .object({
        order_id: providerIdSchema,
        created_at: z.string().optional(),
        read_at: z.string().optional(),
        ready_at: z.string().optional(),
        canceled_at: z.string().optional(),
        reason: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const aiqfomeOrderAddressSchema = z
  .object({
    street_name: z.string().trim().min(1),
    number: z.coerce.string().trim().min(1),
    complement: z.string().nullish(),
    reference: z.string().nullish(),
    city_name: z.string().trim().min(1),
    state_uf: z.string().trim().length(2),
    zip_code: z.coerce.string().trim().min(8),
    latitude: z.coerce.number().min(-90).max(90).nullish(),
    longitude: z.coerce.number().min(-180).max(180).nullish(),
  })
  .passthrough();

export const aiqfomeOrderResponseSchema = z
  .object({
    data: z
      .object({
        id: providerIdSchema,
        created_at: z.string(),
        is_cancelled: z.boolean(),
        is_delivered: z.boolean(),
        is_aiqentrega_delivery: z.boolean(),
        is_pickup: z.boolean(),
        is_scheduled: z.boolean(),
        order_observations: z.string().nullish(),
        user: z
          .object({
            name: z.string().trim().default(''),
            surname: z.string().trim().default(''),
            mobile_phone: z.string().nullish(),
            phone_number: z.string().nullish(),
            address: aiqfomeOrderAddressSchema.nullish(),
          })
          .passthrough(),
        payment_method: z
          .object({
            name: z.string().trim().min(1),
            change: z.coerce.number().min(0).nullish(),
            pre_paid: z.boolean(),
          })
          .passthrough(),
        store: z
          .object({
            id: providerIdSchema,
            name: z.string().trim().min(1),
            preparation_time: z.coerce.number().int().min(0).nullish(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export type AiqfomeWebhookEnvelope = z.infer<typeof aiqfomeWebhookEnvelopeSchema>;
export type AiqfomeWebhookEventName = z.infer<typeof aiqfomeWebhookEventNameSchema>;
export type AiqfomeOrderResponse = z.infer<typeof aiqfomeOrderResponseSchema>;
