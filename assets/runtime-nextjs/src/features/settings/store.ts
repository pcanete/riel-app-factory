import "server-only";
import type { PoolClient } from "pg";
import { sql, transactionSql } from "@/lib/db";

type SettingRow = { key: string; value: unknown };

export type ApplicationOptionRow = {
  namespace: string;
  key: string;
  value: unknown;
  updated_at: Date;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
};

export async function getApplicationOption<T>(namespace: string, key: string, fallback: T): Promise<T> {
  const rows = await sql<{ value: T }>(
    `SELECT value FROM app_setting WHERE namespace = $1 AND key = $2 LIMIT 1`,
    [namespace, key],
  );
  return rows.length ? rows[0].value : fallback;
}

export async function listApplicationOptions() {
  return sql<ApplicationOptionRow>(
    `SELECT setting.namespace,
            setting.key,
            setting.value,
            setting.updated_at,
            setting.updated_by,
            actor.display_name AS updated_by_name,
            actor.email AS updated_by_email
       FROM app_setting AS setting
       LEFT JOIN app_user AS actor ON actor.id = setting.updated_by
      ORDER BY setting.namespace, setting.key`,
  );
}

export async function upsertApplicationOption(
  client: PoolClient,
  actorId: string,
  input: { namespace: string; key: string; value: unknown },
) {
  await transactionSql(
    client,
    `INSERT INTO app_setting (namespace, key, value, updated_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (namespace, key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
    [input.namespace, input.key, JSON.stringify(input.value), actorId],
  );
}

export async function deleteApplicationOption(client: PoolClient, namespace: string, key: string) {
  await transactionSql(
    client,
    `DELETE FROM app_setting WHERE namespace = $1 AND key = $2`,
    [namespace, key],
  );
}

export async function getApplicationSettings() {
  const rows = await sql<SettingRow>(`SELECT key, value FROM app_setting WHERE namespace = 'general'`);
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    locale: typeof values.locale === "string" ? values.locale : "es-AR",
    timezone: typeof values.timezone === "string" ? values.timezone : "America/Buenos_Aires",
  };
}

export async function setApplicationGeneralSettings(
  client: PoolClient,
  actorId: string,
  input: { locale: string; timezone: string },
) {
  for (const [key, value] of Object.entries(input)) {
    await upsertApplicationOption(client, actorId, { namespace: "general", key, value });
  }
}
