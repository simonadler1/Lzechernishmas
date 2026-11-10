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

/** What anyone with the link may know about a campaign. No title, no contact details. */
export interface PublicCampaignDto {
  slug: string;
  honoreeNameHe: string;
  honoreeNameEn: string | null;
  dedicationType: DedicationType;
  message: string | null;
  endDate: string;
  endDateHebrew: string | null;
  timezone: string;
  status: 'active' | 'completed';
}

/** A masechta that is not open. Open ones are simply absent. */
export interface ChartEntry {
  masechtaId: string;
  status: 'taken' | 'finished';
  /** The holder's display name, or "Anonymous". */
  name: string;
}

export interface PublicChartResponse {
  campaign: PublicCampaignDto;
  progress: Progress;
  masechtos: ChartEntry[];
}

export interface ClaimCreatedResponse {
  manageToken: string;
  masechtaIds: string[];
  /** Whether a message with the link was sent. */
  notified: boolean;
}

export interface PortionClaim {
  id: string;
  masechtaId: string;
  status: 'taken' | 'finished';
}

/** One submission on a my-portion page, with the details only its owner and the organizer see. */
export interface PortionSubmission {
  participantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  isAnonymous: boolean;
  claims: PortionClaim[];
}

export interface PortionResponse {
  campaign: PublicCampaignDto;
  submissions: PortionSubmission[];
}

export interface ParticipantUpdatedResponse {
  submission: PortionSubmission;
  /** Set when the edit removed the address this sign-in link was built on. Use it from now on. */
  manageToken?: string;
}

/** What this phone remembers: masechtos and links only, never names or contact details. */
export interface MineResponse {
  submissions: { manageToken: string; masechtos: { masechtaId: string; status: 'taken' | 'finished' }[] }[];
}
