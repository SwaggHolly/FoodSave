import { z } from 'zod';

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
  delivery?: DeliveryDetails;
  status: 'reserved';
  items: OrderLine[];
  total: number;
  createdAt: string;
}

export interface OrderReceipt {
  orderId: string;
  status: Order['status'];
  total: number;
  createdAt: string;
}
