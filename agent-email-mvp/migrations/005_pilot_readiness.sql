CREATE TABLE IF NOT EXISTS workspace_members (
 organization_id uuid NOT NULL REFERENCES organizations(id),email text NOT NULL,
 role text NOT NULL DEFAULT 'owner' CHECK(role IN ('owner','member')),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,email)
);
INSERT INTO workspace_members(organization_id,email) SELECT id,lower(owner_email) FROM organizations WHERE owner_email IS NOT NULL ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS workspace_creation_requests (
 email text NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES organizations(id),PRIMARY KEY(email,request_id)
);
CREATE TABLE IF NOT EXISTS workspace_alerts (
 organization_id uuid NOT NULL REFERENCES organizations(id),source_key text NOT NULL,category text NOT NULL,
 title text NOT NULL,detail text NOT NULL,status text NOT NULL DEFAULT 'open',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,source_key)
);
CREATE INDEX IF NOT EXISTS workspace_members_email ON workspace_members(email);
