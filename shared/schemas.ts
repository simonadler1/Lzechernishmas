import { z } from 'zod';

/** Request bodies, validated on the server and reused for types in the web app. */

export const requestCodeSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').max(254),
});

export const verifyCodeSchema = z.object({
  email: z.string().trim().min(1).max(254),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});
