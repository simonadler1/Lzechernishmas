export type Channel = 'sms' | 'email';

export type Template =
  | 'login_code'
  | 'participant_code'
  | 'claim_confirmation'
  | 'invitation'
  | 'reminder'
  | 'campaign_complete';

export interface SendRequest {
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
}

/** A delivery provider. Real SMS and email are added by writing another one of these. */
export interface MessageSender {
  send(message: SendRequest): Promise<{ providerId: string }>;
}

export interface OutboundMessage extends SendRequest {
  template: Template;
  campaignId?: string | null;
  /** A second dispatch with the same key is dropped, which makes retries safe. */
  dedupeKey?: string;
}

export type DispatchStatus = 'sent' | 'failed' | 'suppressed' | 'duplicate';
