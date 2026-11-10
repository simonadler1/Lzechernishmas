import { z } from 'zod';
import { isRealDate, isValidTimezone } from './dates';
import { DEDICATION_TYPES } from './dedication';

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

// Campaigns


const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .nullish()
    .transform((value) => value || null);

const campaignFields = {
  title: z.string().trim().min(1, 'Give the campaign a title.').max(120, 'Keep the title under 120 characters.'),
  honoreeNameHe: z
    .string()
    .trim()
    .min(1, 'Enter the name in Hebrew.')
    .max(120, 'Keep the name under 120 characters.')
    .refine((value) => /[֐-׿]/.test(value), 'Enter the name in Hebrew letters.'),
  honoreeNameEn: optionalText(120),
  dedicationType: z.enum(DEDICATION_TYPES, 'Choose what the learning is for.'),
  message: optionalText(1000),
  endDate: z.string().refine(isRealDate, 'Choose a real date.'),
  timezone: z.string().refine(isValidTimezone, 'Choose a valid timezone.'),
};

export const campaignCreateSchema = z.object(campaignFields);
export const campaignUpdateSchema = z.object(campaignFields).partial();

export type CampaignInput = z.input<typeof campaignCreateSchema>;
