import { z } from 'zod';
import { PRODUCT_CATEGORIES } from './product.js';

export const merchantApplicationRequestSchema = z.object({
  storeName: z.string().trim().min(2).max(100),
  ownerName: z.string().trim().min(2).max(80),
  contactEmail: z.string().trim().email().max(254),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[+\d\s()-]+$/),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(160),
  description: z.string().trim().max(500).optional().default('')
});

export const merchantApplicationSchema = merchantApplicationRequestSchema.extend({
  sub: z.string().min(1),
  status: z.enum(['pending_review', 'approved', 'rejected']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reviewedBy: z.string().optional()
});

export const merchantProductRequestSchema = z
  .object({
    title: z.string().trim().min(2).max(100),
    category: z.enum(PRODUCT_CATEGORIES),
    originalPrice: z.number().int().positive(),
    discountPrice: z.number().int().positive(),
    expirationDate: z.iso.datetime(),
    stock: z.number().int().positive().max(1000),
    imageKey: z.string().min(1).max(512)
  })
  .refine((product) => product.discountPrice < product.originalPrice, {
    path: ['discountPrice'],
    message: 'El precio con descuento debe ser menor al precio original.'
  });

export type MerchantApplicationRequest = z.infer<
  typeof merchantApplicationRequestSchema
>;
export type MerchantApplication = z.infer<typeof merchantApplicationSchema>;
export type MerchantProductRequest = z.infer<typeof merchantProductRequestSchema>;

export function merchantProductExpirationError(
  product: Pick<MerchantProductRequest, 'category' | 'expirationDate'>,
  now: Date
): string | undefined {
  const remaining = Date.parse(product.expirationDate) - now.getTime();
  const days = product.category === 'verduras' ? 2 : 5;
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > days * 86_400_000) {
    return `El vencimiento debe ser futuro y ocurrir dentro de ${days} días.`;
  }
  return undefined;
}

export class MerchantApplicationAlreadyExistsError extends Error {
  constructor() {
    super('Ya existe una solicitud de comercio para esta cuenta.');
    this.name = 'MerchantApplicationAlreadyExistsError';
  }
}

export class MerchantNotApprovedError extends Error {
  constructor() {
    super('La cuenta de comercio no está aprobada para publicar productos.');
    this.name = 'MerchantNotApprovedError';
  }
}
