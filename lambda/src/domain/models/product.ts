import { z } from 'zod';

export const PRODUCT_CATEGORIES = ['frutas', 'panaderia', 'lacteos', 'sorpresa'] as const;

export const productSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  storeName: z.string().min(1),
  category: z.enum(PRODUCT_CATEGORIES),
  originalPrice: z.number().int().positive(),
  discountPrice: z.number().int().positive(),
  expirationDate: z.iso.datetime(),
  stock: z.number().int().nonnegative(),
  imageUrl: z.url()
}).refine((product) => product.discountPrice < product.originalPrice, {
  path: ['discountPrice'],
  message: 'El precio con descuento debe ser menor al precio original.'
});

export type Product = z.infer<typeof productSchema>;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
