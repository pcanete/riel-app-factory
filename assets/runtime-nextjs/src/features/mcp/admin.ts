import type { PoolClient } from "pg";
import { sql, transactionSql } from "@/lib/db";

export type AgentKind = "personal" | "service";

export type ManagedAgent = {
  id: string;
  name: string;
  role_key: string;
  role_label: string;
  scopes: string[];
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_role_key: string | null;
  owner_active: boolean | null;
  agent_kind: AgentKind;
  active: boolean;
  expires_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
  event_count: string;
};

export type AgentEvent = {
  id: string;
  agent_name: string;
  responsible_user_id: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
  tool_name: string;
  entity_key: string | null;
  input_summary: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  result_count: number | null;
  duration_ms: number | null;
  error_message: string | null;
  started_at: Date;
};

export type ManagedAgentInput = {
  name: string;
  roleKey: string;
  scopes: string[];
  tokenHash: string;
  expiresAt: string;
  ownerUserId: string;
  createdByUserId: string;
  agentKind: AgentKind;
};

export type ManagedAgentForUpdate = {
  id: string;
  name: string;
  active: boolean;
  owner_user_id: string | null;
  owner_active: boolean | null;
  agent_kind: AgentKind;
};

export function isManagedAgentId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function createManagedAgent(client: PoolClient, input: ManagedAgentInput) {
  const rows = await transactionSql<{ id: string }>(
    client,
    `INSERT INTO app_agent (
       name, token_hash, role_key, scopes, expires_at,
       owner_user_id, created_by_user_id, agent_kind
     )
     SELECT $1, $2, $3, $4::text[], $5, owner.id, $7, $8
       FROM app_user AS owner
      WHERE owner.id = $6
        AND owner.active = TRUE
     RETURNING id`,
    [
      input.name,
      input.tokenHash,
      input.roleKey,
      input.scopes,
      input.expiresAt,
      input.ownerUserId,
      input.createdByUserId,
      input.agentKind,
    ],
  );
  if (!rows[0]) throw new Error("AGENT_OWNER_INVALID");
  return rows[0].id;
}

export async function getManagedAgentForUpdate(client: PoolClient, id: string) {
  const rows = await transactionSql<ManagedAgentForUpdate>(
    client,
    `SELECT agent.id,
            agent.name,
            agent.active,
            agent.owner_user_id,
            owner.active AS owner_active,
            agent.agent_kind
       FROM app_agent AS agent
       LEFT JOIN app_user AS owner ON owner.id = agent.owner_user_id
      WHERE agent.id = $1
      FOR UPDATE OF agent`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setManagedAgentActive(client: PoolClient, id: string, active: boolean) {
  const rows = await transactionSql<{ id: string }>(
    client,
    `UPDATE app_agent AS agent
        SET active = $2,
            updated_at = now()
      WHERE agent.id = $1
        AND (
          $2 = FALSE
          OR EXISTS (
            SELECT 1
              FROM app_user AS owner
             WHERE owner.id = agent.owner_user_id
               AND owner.active = TRUE
          )
        )
      RETURNING agent.id`,
    [id, active],
  );
  return Boolean(rows[0]);
}

export async function setManagedAgentResponsibility(
  client: PoolClient,
  id: string,
  ownerUserId: string,
  agentKind: AgentKind,
) {
  const rows = await transactionSql<{ id: string }>(
    client,
    `UPDATE app_agent AS agent
        SET owner_user_id = owner.id,
            agent_kind = $3,
            updated_at = now()
       FROM app_user AS owner
      WHERE agent.id = $1
        AND owner.id = $2
        AND owner.active = TRUE
      RETURNING agent.id`,
    [id, ownerUserId, agentKind],
  );
  return Boolean(rows[0]);
}

export async function listManagedAgents() {
  return sql<ManagedAgent>(
    `SELECT agent.id,
            agent.name,
            agent.role_key,
            role.label AS role_label,
            agent.scopes,
            agent.owner_user_id,
            owner.display_name AS owner_name,
            owner.email AS owner_email,
            owner.role_key AS owner_role_key,
            owner.active AS owner_active,
            agent.agent_kind,
            agent.active,
            agent.expires_at,
            agent.last_used_at,
            agent.created_at,
            COUNT(event.id)::text AS event_count
       FROM app_agent AS agent
       JOIN app_role AS role ON role.key = agent.role_key
       LEFT JOIN app_user AS owner ON owner.id = agent.owner_user_id
       LEFT JOIN app_agent_event AS event ON event.agent_id = agent.id
      GROUP BY agent.id, role.label, owner.id
      ORDER BY agent.active DESC, agent.name ASC`,
  );
}

export async function countAgentEvents() {
  const rows = await sql<{ total: number }>("SELECT count(*)::int AS total FROM app_agent_event");
  return rows[0]?.total ?? 0;
}

export async function listAgentEvents({ limit = 25, offset = 0 } = {}) {
  return sql<AgentEvent>(
    `SELECT event.id,
            agent.name AS agent_name,
            event.responsible_user_id,
            responsible.display_name AS responsible_name,
            responsible.email AS responsible_email,
            event.tool_name,
            event.entity_key,
            event.input_summary,
            event.status,
            event.result_count,
            event.duration_ms,
            event.error_message,
            event.started_at
       FROM app_agent_event AS event
       JOIN app_agent AS agent ON agent.id = event.agent_id
       LEFT JOIN app_user AS responsible ON responsible.id = event.responsible_user_id
      ORDER BY event.started_at DESC
      LIMIT $1 OFFSET $2`,
    [Math.min(200, Math.max(1, limit)), Math.max(0, offset)],
  );
}
