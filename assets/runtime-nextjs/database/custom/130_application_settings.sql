-- NAMESPACED APPLICATION OPTIONS. SAFE TO REAPPLY.

CREATE TABLE IF NOT EXISTS app_setting (
  namespace text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, key),
  CONSTRAINT app_setting_namespace_check CHECK (namespace ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  CONSTRAINT app_setting_key_check CHECK (key ~ '^[a-z][a-z0-9_.-]{0,63}$')
);
