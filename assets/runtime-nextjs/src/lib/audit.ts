import type { PoolClient } from "pg";
import { sql, transactionSql } from "@/lib/db";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "attachment_create"
  | "attachment_delete"
  | "user_create"
  | "user_update"
  | "user_status"
  | "user_invite"
  | "user_link"
  | "application_settings_update"
  | "application_option_update"
  | "application_option_delete"
  | "agent_create"
  | "agent_status"
  | "agent_owner";

export type AuditEvent = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  agent_id: string | null;
  agent_name: string | null;
  responsible_user_id: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
  entity_key: string;
  record_id: string | null;
  action: AuditAction;
  changes: unknown;
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
    [
      event.actorId ?? null,
      event.agentId ?? null,
      event.agentEventId ?? null,
      event.responsibleUserId ?? null,
      event.entityKey,
      event.recordId,
      event.action,
      JSON.stringify(event.changes),
    ],
  );
}

export type AuditFilters = { entityKey?: string; action?: AuditAction };

function auditWhere(filters: AuditFilters, values: unknown[]) {
  const conditions: string[] = [];
  if (filters.entityKey) {
    values.push(filters.entityKey);
    conditions.push(`log.entity_key = $${values.length}`);
  }
  if (filters.action) {
    values.push(filters.action);
    conditions.push(`log.action = $${values.length}`);
  }
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

export async function countAuditEvents(filters: AuditFilters = {}) {
  const values: unknown[] = [];
  const where = auditWhere(filters, values);
  const rows = await sql<{ total: number }>(`SELECT count(*)::int AS total FROM app_audit_log AS log ${where}`, values);
  return rows[0]?.total ?? 0;
}

export async function listAuditEvents(filters: AuditFilters & { limit?: number; offset?: number } = {}) {
  const values: unknown[] = [];
  const where = auditWhere(filters, values);
  values.push(Math.min(200, Math.max(1, filters.limit ?? 50)));
  const limit = `$${values.length}`;
  values.push(Math.max(0, filters.offset ?? 0));
  const offset = `$${values.length}`;
  return sql<AuditEvent>(
    `SELECT log.id,
            log.actor_id,
            actor.display_name AS actor_name,
            actor.email AS actor_email,
            log.agent_id,
            agent.name AS agent_name,
            log.responsible_user_id,
            responsible.display_name AS responsible_name,
            responsible.email AS responsible_email,
            log.entity_key,
            log.record_id,
            log.action,
            log.changes,
            log.created_at
       FROM app_audit_log AS log
       LEFT JOIN app_user AS actor ON actor.id = log.actor_id
       LEFT JOIN app_agent AS agent ON agent.id = log.agent_id
       LEFT JOIN app_user AS responsible ON responsible.id = log.responsible_user_id
       ${where}
      ORDER BY log.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
}
