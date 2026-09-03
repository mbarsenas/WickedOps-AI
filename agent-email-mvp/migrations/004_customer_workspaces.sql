ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_email text UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS monthly_limit integer NOT NULL DEFAULT 100;
INSERT INTO app_settings(key,value) SELECT 'legacy_organization',to_jsonb(id::text) FROM organizations ORDER BY created_at,id LIMIT 1 ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS sending_domains (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL UNIQUE, provider_id text UNIQUE, status text NOT NULL DEFAULT 'pending',
 records jsonb NOT NULL DEFAULT '[]', receiving text NOT NULL DEFAULT 'disabled', created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sending_domains(organization_id,name,status,receiving)
 SELECT DISTINCT a.organization_id,ei.provider_domain,'pending','disabled' FROM email_identities ei JOIN agents a ON a.id=ei.agent_id
 WHERE ei.provider_domain IS NOT NULL ON CONFLICT(name) DO NOTHING;
ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE email_jobs j SET organization_id=a.organization_id FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN agents a ON a.id=c.agent_id WHERE m.provider_message_id=j.provider_message_id AND j.organization_id IS NULL;
ALTER TABLE email_api_events ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE email_api_events ADD COLUMN IF NOT EXISTS payload_hash text;
ALTER TABLE email_api_events ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE email_api_events ADD COLUMN IF NOT EXISTS quota_reserved boolean NOT NULL DEFAULT false;
ALTER TABLE email_api_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS api_email_idempotency ON email_api_events(organization_id,idempotency_key);
CREATE TABLE IF NOT EXISTS monthly_usage (
 organization_id uuid NOT NULL REFERENCES organizations(id), period date NOT NULL, accepted integer NOT NULL DEFAULT 0, reserved integer NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,period)
);
CREATE INDEX IF NOT EXISTS domains_org_idx ON sending_domains(organization_id);
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS signing_secret text NOT NULL DEFAULT ('whsec_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''));
CREATE TABLE IF NOT EXISTS webhook_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id),
 event_id text NOT NULL,event_type text NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,last_status integer,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,
 UNIQUE(endpoint_id,event_id)
);
CREATE INDEX IF NOT EXISTS webhook_pending_idx ON webhook_deliveries(organization_id,next_attempt_at) WHERE status='pending';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_event_at bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS inbound_emails (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),provider_id text NOT NULL,
 from_address text NOT NULL,to_addresses text[] NOT NULL,subject text NOT NULL,text_body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,provider_id)
);
