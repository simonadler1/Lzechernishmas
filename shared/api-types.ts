import type { DedicationType } from './dedication';

/** Shapes of API responses, shared by the Worker and the web app. */

export type CampaignStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface Progress {
  finished: number;
  taken: number;
  open: number;
  total: number;
}

/** A campaign as its organizer sees it. */
export interface CampaignDto {
  id: string;
  slug: string;
  title: string;
  honoreeNameHe: string;
  honoreeNameEn: string | null;
  dedicationType: DedicationType;
  message: string | null;
  endDate: string;
  timezone: string;
  status: CampaignStatus;
  activatedOn: string | null;
  completedAt: string | null;
  createdAt: string;
  progress: Progress;
}
