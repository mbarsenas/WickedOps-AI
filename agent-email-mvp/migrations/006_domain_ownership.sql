ALTER TABLE sending_domains ADD COLUMN IF NOT EXISTS ownership_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sending_domains ADD COLUMN IF NOT EXISTS ownership_verified_at timestamptz;
ALTER TABLE sending_domains ADD COLUMN IF NOT EXISTS setup_lease_until timestamptz;
UPDATE sending_domains SET ownership_verified_at=now() WHERE provider_id IS NOT NULL AND ownership_verified_at IS NULL;
