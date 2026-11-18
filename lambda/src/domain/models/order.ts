import { z } from 'zod';
import { PRIVACY_POLICY_VERSION } from './privacy.js';

const deliveryAddressSchema = z.object({
  city: z.string().trim().min(2).max(80),
  zone: z.string().trim().min(2).max(80),
  neighborhood: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(160),
  reference: z.string().trim().max(160).optional().default('')
});

export const deliveryDetailsSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pickup') }),
  deliveryAddressSchema.extend({ method: z.literal('delivery') })
]);

export const createOrderRequestSchema = z
  .object({
    buyerName: z.string().trim().min(2).max(80),
    buyerPhone: z
      .string()
      .trim()
      .min(7)
      .max(20)
      .regex(/^[+\d\s()-]+$/, 'Ingresa un teléfono válido.'),
    buyerEmail: z.string().trim().email().max(254).optional(),
    privacyPolicyVersion: z.literal(PRIVACY_POLICY_VERSION),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().positive().max(20)
        })
      )
      .min(1)
      .max(20),
    delivery: deliveryDetailsSchema.optional()
  })
  .superRefine((request, context) => {
    const productIds = request.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Cada producto debe aparecer una sola vez.'
      });
    }
  });

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type DeliveryDetails = z.infer<typeof deliveryDetailsSchema>;

const orderLineSchema = z.object({
  productId: z.string().min(1),
  title: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().positive(),
  lineTotal: z.number().int().nonnegative()
});

export const orderSchema = z.object({
  id: z.string().min(1),
  buyerName: z.string(),
  buyerPhone: z.string(),
  buyerEmail: z.string().email().optional(),
  privacyPolicyVersion: z.string(),
  privacyAcceptedAt: z.string().datetime(),
  delivery: deliveryDetailsSchema.optional(),
  status: z.enum(['pending_payment', 'paid', 'expired', 'payment_late']),
  items: z.array(orderLineSchema),
  total: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  paymentExpiresAt: z.string().datetime(),
  paymentPreferenceId: z.string().optional(),
  checkoutUrl: z.string().url().optional(),
  paymentId: z.string().optional(),
  statusSubscriptionTokenHash: z.string().regex(/^[a-f\d]{64}$/i).optional(),
  paidAt: z.string().datetime().optional(),
  expiredAt: z.string().datetime().optional()
});

export interface OrderLine {
  productId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  privacyPolicyVersion: string;
  privacyAcceptedAt: string;
  delivery?: DeliveryDetails;
  status: 'pending_payment' | 'paid' | 'expired' | 'payment_late';
  items: OrderLine[];
  total: number;
  createdAt: string;
  paymentExpiresAt: string;
  paymentPreferenceId?: string;
  checkoutUrl?: string;
  paymentId?: string;
  statusSubscriptionTokenHash?: string;
  statusSubscriptionToken?: string;
  paidAt?: string;
  expiredAt?: string;
}

export interface OrderReceipt {
  orderId: string;
  status: 'pending_payment';
  total: number;
  createdAt: string;
  paymentExpiresAt: string;
  statusSubscriptionToken: string;
}
