import { z } from 'zod';
import { PRIVACY_POLICY_VERSION } from './privacy.js';

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s()-]*$/, 'Ingresa un teléfono válido.'),
  privacyPolicyVersion: z.literal(PRIVACY_POLICY_VERSION)
});

export const userProfileSchema = updateUserProfileSchema.extend({
  privacyPolicyVersion: z.string().optional(),
  sub: z.string().min(1),
  email: z.string().email(),
  updatedAt: z.string().datetime(),
  privacyAcceptedAt: z.string().datetime().optional()
});

export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;

export type UserProfile = z.infer<typeof userProfileSchema>;
