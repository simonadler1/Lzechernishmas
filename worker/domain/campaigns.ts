import type { DedicationType } from '../../shared/dedication';

export type CampaignStatus = 'draft' | 'active' | 'completed' | 'archived';

/** A row of the `campaigns` table. */
export interface Campaign {
  id: string;
  owner_user_id: string;
  slug: string;
  title: string;
  honoree_name_he: string;
  honoree_name_en: string | null;
  dedication_type: DedicationType;
  message: string | null;
  end_date: string;
  timezone: string;
  status: CampaignStatus;
  activated_on: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function campaignText(campaign: Campaign) {
  return {
    honoreeNameHe: campaign.honoree_name_he,
    honoreeNameEn: campaign.honoree_name_en,
    dedicationType: campaign.dedication_type,
  };
}
