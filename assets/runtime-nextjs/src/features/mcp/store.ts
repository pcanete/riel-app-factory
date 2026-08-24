import { createHash } from "node:crypto";
import { sql } from "@/lib/db";

export type AgentPrincipal = {
  id: string;
  name: string;
  roleKey: string;
  scopes: string[];
  ownerUserId: string;
  ownerRoleKey: string;
  ownerName: string;
  ownerEmail: string;
};

type AgentRow = {
  id: string;
  name: string;
  role_key: string;
  scopes: string[];
  owner_user_id: string;
  owner_role_key: string;
  owner_name: string;
  owner_email: string;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function authenticateAgentToken(token: string): Promise<AgentPrincipal | null> {
  if (!token.startsWith("factory_mcp_") || token.length < 48 || token.length > 160) return null;
  const rows = await sql<AgentRow>(
    `UPDATE app_agent AS agent
        SET last_used_at = now()
       FROM app_user AS owner
      WHERE agent.token_hash = $1
        AND agent.active = TRUE
        AND agent.owner_user_id = owner.id
        AND owner.active = TRUE
        AND (agent.expires_at IS NULL OR agent.expires_at > now())
      RETURNING agent.id,
                agent.name,
                agent.role_key,
                agent.scopes,
                owner.id AS owner_user_id,
                owner.role_key AS owner_role_key,
                owner.display_name AS owner_name,
                owner.email AS owner_email`,
    [tokenHash(token)],
  );
  const row = rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        roleKey: row.role_key,
        scopes: row.scopes,
        ownerUserId: row.owner_user_id,
        ownerRoleKey: row.owner_role_key,
        ownerName: row.owner_name,
        ownerEmail: row.owner_email,
      }
    : null;
}

export async function startAgentToolEvent(input: {
  agentId: string;
  toolName: string;
  entityKey?: string;
  inputSummary: Record<string, unknown>;
}) {
  const rows = await sql<{ id: string }>(
    `INSERT INTO app_agent_event (agent_id, responsible_user_id, tool_name, entity_key, input_summary, status)
     SELECT agent.id, agent.owner_user_id, $2, $3, $4::jsonb, 'running'
       FROM app_agent AS agent
      WHERE agent.id = $1
        AND agent.owner_user_id IS NOT NULL
        AND (SELECT COUNT(*) FROM app_agent_event WHERE agent_id = $1 AND started_at > now() - interval '1 minute') < 120
     RETURNING id`,
    [input.agentId, input.toolName, input.entityKey ?? null, JSON.stringify(input.inputSummary)],
  );
  if (!rows[0]) throw new Error("El agente superó el límite de 120 herramientas por minuto.");
  return { id: rows[0].id, startedAt: Date.now() };
}

export async function finishAgentToolEvent(input: {
  id: string;
  startedAt: number;
  status: "completed" | "failed";
  resultCount?: number;
  errorMessage?: string;
}) {
  await sql(
    `UPDATE app_agent_event
        SET status = $2,
            result_count = $3,
            duration_ms = $4,
            error_message = $5,
            finished_at = now()
      WHERE id = $1`,
    [
      input.id,
      input.status,
      input.resultCount ?? null,
      Math.max(0, Date.now() - input.startedAt),
      input.errorMessage?.slice(0, 1_000) ?? null,
    ],
  );
}
