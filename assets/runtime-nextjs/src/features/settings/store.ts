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
  updated_by_agent: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
};

export type ApplicationOptionActor = string | { kind: "user" | "agent"; id: string };
const OPTION_NAME = /^[a-z][a-z0-9_.-]{0,63}$/;
const MAX_OPTION_BYTES = 256 * 1024;

function validateIdentity(namespace: string, key: string) {
  if (!OPTION_NAME.test(namespace) || !OPTION_NAME.test(key)) throw new Error("El namespace o la clave de configuración no son válidos.");
}

function serialized(value: unknown) {
  if (value === undefined) throw new Error("El valor no puede ser undefined; usá null para registrar ausencia.");
  const output = JSON.stringify(value);
  if (output === undefined || Buffer.byteLength(output, "utf8") > MAX_OPTION_BYTES) throw new Error("La opción debe ser JSON y no superar 256 KB.");
  return output;
}

export async function getApplicationOption<T>(namespace: string, key: string, fallback: T): Promise<T> {
  const rows = await sql<{ value: T }>(
    `SELECT value FROM app_setting WHERE namespace = $1 AND key = $2 LIMIT 1`,
    [namespace, key],
  );
  return rows.length ? rows[0].value : fallback;
}

export async function listApplicationOptions(namespace?: string) {
  if (namespace) validateIdentity(namespace, "item");
  return sql<ApplicationOptionRow>(
    `SELECT setting.namespace,
            setting.key,
            setting.value,
            setting.updated_at,
            setting.updated_by,
            setting.updated_by_agent,
            COALESCE(actor.display_name, agent.name) AS updated_by_name,
            actor.email AS updated_by_email
       FROM app_setting AS setting
       LEFT JOIN app_user AS actor ON actor.id = setting.updated_by
       LEFT JOIN app_agent AS agent ON agent.id = setting.updated_by_agent
      ${namespace ? "WHERE setting.namespace = $1" : ""}
      ORDER BY setting.namespace, setting.key`,
    namespace ? [namespace] : [],
  );
}

export async function getApplicationOptionRow(namespace: string, key: string) {
  validateIdentity(namespace, key);
  const rows = await listApplicationOptions(namespace);
  return rows.find((row) => row.key === key) ?? null;
}

export async function upsertApplicationOption(
  client: PoolClient,
  actor: ApplicationOptionActor,
  input: { namespace: string; key: string; value: unknown },
) {
  validateIdentity(input.namespace, input.key);
  const identity = typeof actor === "string" ? { kind: "user" as const, id: actor } : actor;
  const rows = await transactionSql<ApplicationOptionRow>(
    client,
    `INSERT INTO app_setting (namespace, key, value, updated_by, updated_by_agent)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (namespace, key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_by_agent = EXCLUDED.updated_by_agent,
           updated_at = now()
     RETURNING namespace, key, value, updated_at, updated_by, updated_by_agent,
               NULL::text AS updated_by_name, NULL::text AS updated_by_email`,
    [input.namespace, input.key, serialized(input.value), identity.kind === "user" ? identity.id : null, identity.kind === "agent" ? identity.id : null],
  );
  return rows[0];
}

export async function deleteApplicationOption(client: PoolClient, namespace: string, key: string) {
  validateIdentity(namespace, key);
  const rows = await transactionSql<{ namespace: string; key: string; value: unknown }>(
    client,
    `DELETE FROM app_setting WHERE namespace = $1 AND key = $2 RETURNING namespace, key, value`,
    [namespace, key],
  );
  return rows[0] ?? null;
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
