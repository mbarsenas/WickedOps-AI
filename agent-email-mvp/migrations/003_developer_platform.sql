CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, key_prefix text NOT NULL, key_hash text NOT NULL UNIQUE,
  last_used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  url text NOT NULL, event_types text[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_api_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  api_key_id uuid REFERENCES api_keys(id), provider_id text, from_address text NOT NULL, to_addresses text[] NOT NULL,
  subject text NOT NULL, status text NOT NULL, error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS email_api_events_org_idx ON email_api_events(organization_id,created_at DESC);
