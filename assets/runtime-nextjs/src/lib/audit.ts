import type { PoolClient } from "pg";
import { sql, transactionSql } from "@/lib/db";

export type AuditAction =
  | "create" | "update" | "delete" | "attachment_create" | "attachment_delete"
  | "user_create" | "user_update" | "user_status" | "user_invite" | "user_link"
  | "application_settings_update" | "application_option_update" | "application_option_delete"
  | "agent_create" | "agent_status" | "agent_owner";

export type ActivitySource = "human" | "agent";

export type ActivityEvent = {
  event_key: string;
  source: ActivitySource;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  agent_id: string | null;
  agent_name: string | null;
  responsible_user_id: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
  entity_key: string | null;
  record_id: string | null;
  action: string;
  status: "completed" | "failed" | "running";
  details: unknown;
  result_count: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: Date;
};

export async function recordAuditEvent(
  client: PoolClient,
  event: {
    actorId?: string;
    agentId?: string;
    agentEventId?: string;
    responsibleUserId?: string;
    entityKey: string;
    recordId: string;
    action: AuditAction;
    changes: unknown;
  },
) {
  if (Boolean(event.actorId) === Boolean(event.agentId)) {
    throw new Error("La auditoría requiere exactamente una identidad humana o de agente.");
  }
  await transactionSql(
    client,
    `INSERT INTO app_audit_log (
       actor_id, agent_id, agent_event_id, responsible_user_id,
       entity_key, record_id, action, changes
     )
     VALUES (
       $1, $2, $3,
       COALESCE($4, $1, (SELECT owner_user_id FROM app_agent WHERE id = $2)),
       $5, $6, $7, $8::jsonb
     )`,
    [event.actorId ?? null, event.agentId ?? null, event.agentEventId ?? null,
      event.responsibleUserId ?? null, event.entityKey, event.recordId, event.action,
      JSON.stringify(event.changes)],
  );
}

export type ActivityFilters = { source?: ActivitySource; entityKey?: string; action?: string; agentId?: string };

const ACTIVITY_QUERY = `
  SELECT 'audit:' || log.id::text AS event_key,
         CASE WHEN log.agent_id IS NULL THEN 'human' ELSE 'agent' END::text AS source,
         log.actor_id, actor.display_name AS actor_name, actor.email AS actor_email,
         log.agent_id, agent.name AS agent_name,
         log.responsible_user_id, responsible.display_name AS responsible_name,
         responsible.email AS responsible_email, log.entity_key,
         log.record_id::text AS record_id, log.action, 'completed'::text AS status,
         log.changes AS details, NULL::integer AS result_count, NULL::integer AS duration_ms,
         NULL::text AS error_message, log.created_at
    FROM app_audit_log AS log
    LEFT JOIN app_user AS actor ON actor.id = log.actor_id
    LEFT JOIN app_agent AS agent ON agent.id = log.agent_id
    LEFT JOIN app_user AS responsible ON responsible.id = log.responsible_user_id
  UNION ALL
  SELECT 'agent:' || event.id::text AS event_key, 'agent'::text AS source,
         NULL::uuid AS actor_id, NULL::text AS actor_name, NULL::text AS actor_email,
         event.agent_id, agent.name AS agent_name,
         event.responsible_user_id, responsible.display_name AS responsible_name,
         responsible.email AS responsible_email, event.entity_key,
         NULL::text AS record_id, event.tool_name AS action, event.status,
         event.input_summary AS details, event.result_count, event.duration_ms,
         event.error_message, event.started_at AS created_at
    FROM app_agent_event AS event
    JOIN app_agent AS agent ON agent.id = event.agent_id
    LEFT JOIN app_user AS responsible ON responsible.id = event.responsible_user_id`;

function activityWhere(filters: ActivityFilters, values: unknown[]) {
  const conditions: string[] = [];
  if (filters.source) { values.push(filters.source); conditions.push(`activity.source = $${values.length}`); }
  if (filters.entityKey) { values.push(filters.entityKey); conditions.push(`activity.entity_key = $${values.length}`); }
  if (filters.action) { values.push(filters.action); conditions.push(`activity.action = $${values.length}`); }
  if (filters.agentId) { values.push(filters.agentId); conditions.push(`activity.agent_id = $${values.length}::uuid`); }
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

export async function countActivityEvents(filters: ActivityFilters = {}) {
  const values: unknown[] = [];
  const where = activityWhere(filters, values);
  const rows = await sql<{ total: number }>(`SELECT count(*)::int AS total FROM (${ACTIVITY_QUERY}) AS activity ${where}`, values);
  return rows[0]?.total ?? 0;
}

export async function listActivityEvents(filters: ActivityFilters & { limit?: number; offset?: number } = {}) {
  const values: unknown[] = [];
  const where = activityWhere(filters, values);
  values.push(Math.min(200, Math.max(1, filters.limit ?? 50)));
  const limit = `$${values.length}`;
  values.push(Math.max(0, filters.offset ?? 0));
  const offset = `$${values.length}`;
  return sql<ActivityEvent>(`SELECT * FROM (${ACTIVITY_QUERY}) AS activity ${where} ORDER BY activity.created_at DESC, activity.event_key ASC LIMIT ${limit} OFFSET ${offset}`, values);
}

export async function listActivityAgents() {
  return sql<{ id: string; name: string }>(`SELECT id, name FROM app_agent ORDER BY active DESC, name ASC`);
}
