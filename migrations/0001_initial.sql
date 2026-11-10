CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, created_at TEXT NOT NULL
);

CREATE TABLE login_codes (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL,
  consumed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX login_codes_email ON login_codes(email, created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  honoree_name_he TEXT NOT NULL, honoree_name_en TEXT,
  dedication_type TEXT NOT NULL CHECK (dedication_type IN ('ilui_nishmas','refuah_shleima','zechus','other')),
  message TEXT, end_date TEXT NOT NULL, timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed','archived')),
  activated_on TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX campaigns_owner ON campaigns(owner_user_id);
CREATE INDEX campaigns_reminders ON campaigns(status, end_date);

CREATE TABLE participants (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL, is_anonymous INTEGER NOT NULL DEFAULT 0,
  phone TEXT, email TEXT,
  source TEXT NOT NULL CHECK (source IN ('public','organizer')), created_at TEXT NOT NULL
);
CREATE INDEX participants_campaign ON participants(campaign_id);

CREATE TABLE claims (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  masechta_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','completed','released')),
  claimed_at TEXT NOT NULL, completed_at TEXT, released_at TEXT
);
-- The core guarantee: one live holder per masechta per campaign.
CREATE UNIQUE INDEX claims_one_holder ON claims(campaign_id, masechta_id) WHERE status <> 'released';
CREATE INDEX claims_participant ON claims(participant_id);

CREATE TABLE participant_login_codes (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  channel TEXT NOT NULL CHECK (channel IN ('sms','email')), address TEXT NOT NULL,
  code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL,
  consumed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX participant_login_codes_address ON participant_login_codes(campaign_id, channel, address, created_at);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL, phone TEXT, email TEXT, invited_at TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX contacts_phone ON contacts(campaign_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX contacts_email ON contacts(campaign_id, email) WHERE email IS NOT NULL;

CREATE TABLE outbound_messages (
  id TEXT PRIMARY KEY, campaign_id TEXT, channel TEXT NOT NULL CHECK (channel IN ('sms','email')),
  to_address TEXT NOT NULL, template TEXT NOT NULL, subject TEXT, body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','suppressed')),
  dedupe_key TEXT UNIQUE, provider_id TEXT, error TEXT, created_at TEXT NOT NULL, sent_at TEXT
);

CREATE TABLE opt_outs (
  channel TEXT NOT NULL, address TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (channel, address)
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL
);
