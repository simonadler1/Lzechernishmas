import { z } from 'zod';
import { isRealDate, isValidTimezone } from './dates';
import { DEDICATION_TYPES } from './dedication';
import { isValidMasechta } from './shas';

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
  honoreeName: z.string().trim().min(1, 'Enter the name.').max(120, 'Keep the name under 120 characters.'),
  dedicationType: z.enum(DEDICATION_TYPES, 'Choose what the learning is for.'),
  message: optionalText(1000),
  endDate: z.string().refine(isRealDate, 'Choose a real date.'),
  // Not asked for in the form. The page sends the browser's timezone when a campaign is created.
  timezone: z.string().refine(isValidTimezone, 'Choose a valid timezone.').optional(),
};

export const campaignCreateSchema = z.object(campaignFields);
export const campaignUpdateSchema = z.object(campaignFields).partial();

export type CampaignInput = z.input<typeof campaignCreateSchema>;

// Taking masechtos and editing a submission

const nameField = z.string().trim().min(1, 'Enter your name.').max(80, 'Keep the name under 80 characters.');
const contactField = z
  .string()
  .trim()
  .max(254)
  .nullish()
  .transform((value) => value || null);

/** The details of one submission. Phone and email are checked on the server, where the campaign's region is known. */
export const participantDetailsSchema = z.object({
  name: nameField,
  phone: contactField,
  email: contactField,
  isAnonymous: z.boolean().optional().default(false),
});

const masechtaIds = (max: number) =>
  z
    .array(z.string())
    .min(1, 'Choose at least one masechta.')
    .max(max, `Choose up to ${max} masechtos at a time.`)
    .refine((ids) => ids.every(isValidMasechta), 'One of these is not a masechta.')
    .transform((ids) => [...new Set(ids)]);

export const MAX_PUBLIC_CLAIM = 10;

export const publicClaimSchema = participantDetailsSchema.extend({ masechtaIds: masechtaIds(MAX_PUBLIC_CLAIM) });
export const organizerClaimSchema = participantDetailsSchema.extend({ masechtaIds: masechtaIds(63) });

export const signInRequestSchema = z.object({
  address: z.string().trim().min(1, 'Enter the phone number or email you gave.').max(254),
});

export const signInVerifySchema = signInRequestSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

export const claimStatusSchema = z.object({ status: z.enum(['claimed', 'completed', 'released']) });

export type ParticipantDetailsInput = z.input<typeof participantDetailsSchema>;
export type PublicClaimInput = z.input<typeof publicClaimSchema>;

// Contacts and invitations

export const contactsBatchSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().max(200).default(''),
        phone: z.string().max(100).nullish(),
        email: z.string().max(254).nullish(),
      }),
    )
    .min(1, 'Add at least one contact.')
    .max(500, 'Add up to 500 contacts at a time.'),
});

export const invitationsSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(1000).optional(),
  confirmedExpectation: z.literal(true, 'Confirm that these people would expect to hear from you about this campaign.'),
});
