import { z } from 'zod';

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
      .max(20)
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
