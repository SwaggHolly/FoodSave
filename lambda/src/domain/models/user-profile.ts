import { z } from 'zod';

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s()-]*$/, 'Ingresa un teléfono válido.')
});

export const userProfileSchema = updateUserProfileSchema.extend({
  sub: z.string().min(1),
  email: z.string().email(),
  updatedAt: z.string().datetime()
});

export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;

export type UserProfile = z.infer<typeof userProfileSchema>;
