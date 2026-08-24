-- HUMAN ACCOUNTABILITY FOR AGENTS AND IMMUTABLE RESPONSIBILITY SNAPSHOTS. SAFE TO REAPPLY.

ALTER TABLE app_agent ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE app_agent ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
ALTER TABLE app_agent ADD COLUMN IF NOT EXISTS agent_kind text NOT NULL DEFAULT 'personal';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_agent_owner_user_id_fkey') THEN
    ALTER TABLE app_agent ADD CONSTRAINT app_agent_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES app_user(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_agent_created_by_user_id_fkey') THEN
    ALTER TABLE app_agent ADD CONSTRAINT app_agent_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES app_user(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE app_agent DROP CONSTRAINT IF EXISTS app_agent_kind_check;
ALTER TABLE app_agent ADD CONSTRAINT app_agent_kind_check
  CHECK (agent_kind IN ('personal', 'service'));

-- Preserve existing installations automatically only when responsibility is unambiguous.
WITH active_users AS (
  SELECT id, count(*) OVER () AS total
    FROM app_user
   WHERE active = TRUE
),
sole_active_user AS (
  SELECT id
    FROM active_users
   WHERE total = 1
)
UPDATE app_agent AS agent
   SET owner_user_id = sole.id,
       created_by_user_id = COALESCE(agent.created_by_user_id, sole.id),
       agent_kind = 'service'
  FROM sole_active_user AS sole
 WHERE agent.owner_user_id IS NULL;

DROP INDEX IF EXISTS app_agent_name_normalized_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS app_agent_owner_name_normalized_uidx
  ON app_agent (owner_user_id, lower(trim(name)))
  WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS app_agent_owner_active_idx
  ON app_agent (owner_user_id, active);
CREATE INDEX IF NOT EXISTS app_agent_created_by_idx
  ON app_agent (created_by_user_id);

ALTER TABLE app_agent_event ADD COLUMN IF NOT EXISTS responsible_user_id uuid;
ALTER TABLE app_audit_log ADD COLUMN IF NOT EXISTS responsible_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_agent_event_responsible_user_id_fkey') THEN
    ALTER TABLE app_agent_event ADD CONSTRAINT app_agent_event_responsible_user_id_fkey
      FOREIGN KEY (responsible_user_id) REFERENCES app_user(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_audit_log_responsible_user_id_fkey') THEN
    ALTER TABLE app_audit_log ADD CONSTRAINT app_audit_log_responsible_user_id_fkey
      FOREIGN KEY (responsible_user_id) REFERENCES app_user(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE app_agent_event AS event
   SET responsible_user_id = agent.owner_user_id
  FROM app_agent AS agent
 WHERE event.agent_id = agent.id
   AND event.responsible_user_id IS NULL
   AND agent.owner_user_id IS NOT NULL;

UPDATE app_audit_log
   SET responsible_user_id = actor_id
 WHERE responsible_user_id IS NULL
   AND actor_id IS NOT NULL;

UPDATE app_audit_log AS log
   SET responsible_user_id = agent.owner_user_id
  FROM app_agent AS agent
 WHERE log.agent_id = agent.id
   AND log.responsible_user_id IS NULL
   AND agent.owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS app_agent_event_responsible_started_idx
  ON app_agent_event (responsible_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS app_audit_log_responsible_created_idx
  ON app_audit_log (responsible_user_id, created_at DESC);

-- Fresh installations are strict. Legacy installations with ambiguous owners remain
-- manageable but their unowned agents cannot authenticate until an administrator assigns one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_agent WHERE owner_user_id IS NULL) THEN
    ALTER TABLE app_agent ALTER COLUMN owner_user_id SET NOT NULL;
  END IF;
END $$;
