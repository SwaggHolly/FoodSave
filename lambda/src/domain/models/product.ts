import { z } from 'zod';

export const PRODUCT_CATEGORIES = ['frutas', 'verduras', 'panaderia', 'lacteos', 'sorpresa'] as const;

export const productSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  storeName: z.string().min(1),
  category: z.enum(PRODUCT_CATEGORIES),
  originalPrice: z.number().int().positive(),
  discountPrice: z.number().int().positive(),
  expirationDate: z.iso.datetime(),
  stock: z.number().int().nonnegative(),
  imageUrl: z.url(),
  publishedAt: z.iso.datetime().optional(),
  removeAt: z.iso.datetime().optional(),
  merchantId: z.string().optional(),
  imageKey: z.string().optional()
}).refine((product) => product.discountPrice < product.originalPrice, {
  path: ['discountPrice'],
  message: 'El precio con descuento debe ser menor al precio original.'
});

export type Product = z.infer<typeof productSchema>;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
