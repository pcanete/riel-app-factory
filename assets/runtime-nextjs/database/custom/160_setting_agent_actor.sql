-- AGENT ATTRIBUTION AND EXPLICIT MCP SETTINGS SCOPES. SAFE TO REAPPLY.

ALTER TABLE app_setting ADD COLUMN IF NOT EXISTS updated_by_agent uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_setting_updated_by_agent_fkey') THEN
    ALTER TABLE app_setting ADD CONSTRAINT app_setting_updated_by_agent_fkey
      FOREIGN KEY (updated_by_agent) REFERENCES app_agent(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE app_setting DROP CONSTRAINT IF EXISTS app_setting_actor_check;
ALTER TABLE app_setting ADD CONSTRAINT app_setting_actor_check CHECK (
  updated_by IS NULL OR updated_by_agent IS NULL
);
CREATE INDEX IF NOT EXISTS app_setting_updated_by_agent_idx ON app_setting (updated_by_agent);

ALTER TABLE app_agent DROP CONSTRAINT IF EXISTS app_agent_scopes_check;
ALTER TABLE app_agent ADD CONSTRAINT app_agent_scopes_check CHECK (
  scopes <@ ARRAY[
    'schema:read', 'records:read', 'records:write', 'records:delete',
    'settings:read', 'settings:write'
  ]::text[]
  AND ARRAY['schema:read', 'records:read']::text[] <@ scopes
);
