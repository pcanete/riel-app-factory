import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import pg from "pg";
import { databaseConfig } from "./db-connection.mjs";

const { Client: PgClient } = pg;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function jsonArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`Falta --${name} con un objeto JSON.`);
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`--${name} debe ser un objeto JSON.`);
  return parsed;
}

function structured(result) {
  if (result.isError) throw new Error(result.content?.map((item) => item.type === "text" ? item.text : "").join(" ") || "La herramienta MCP falló.");
  return result.structuredContent ?? {};
}

const baseUrl = argument("url") ?? "http://127.0.0.1:3000/api/mcp";
const entityKey = argument("entity");
const roleKey = argument("role") ?? "admin";
if (!entityKey || !/^[a-z][a-z0-9_]{0,47}$/.test(entityKey)) {
  throw new Error('Uso: pnpm mcp:smoke:write -- --url http://127.0.0.1:3000/api/mcp --entity entidad --create-values \'{"campo":"valor"}\' --update-values \'{"campo":"otro"}\' [--role admin]');
}
const createValues = jsonArgument("create-values");
const updateValues = jsonArgument("update-values");
const token = `factory_mcp_${randomBytes(32).toString("base64url")}`;
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
const agentName = `Smoke MCP ${new Date().toISOString()} ${randomUUID().slice(0, 8)}`;
const database = new PgClient(databaseConfig({ direct: true }));
await database.connect();

let agentId;
let ownerId;
let ownerWasCreated = false;
let recordId;
let client;
try {
  const role = await database.query("SELECT key FROM app_role WHERE key = $1", [roleKey]);
  if (!role.rowCount) throw new Error(`El rol ${roleKey} no existe.`);
  const existingOwner = await database.query(
    "SELECT id FROM app_user WHERE role_key = $1 AND active = TRUE ORDER BY created_at ASC LIMIT 1",
    [roleKey],
  );
  if (existingOwner.rowCount) {
    ownerId = existingOwner.rows[0].id;
  } else {
    const ownerIdentity = randomUUID();
    const createdOwner = await database.query(
      `INSERT INTO app_user (auth_subject, email, display_name, role_key, active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [
        `smoke:${ownerIdentity}`,
        `smoke-${ownerIdentity}@example.invalid`,
        "Responsable temporal MCP",
        roleKey,
      ],
    );
    ownerId = createdOwner.rows[0].id;
    ownerWasCreated = true;
  }
  const createdAgent = await database.query(
    `INSERT INTO app_agent (
       name, token_hash, role_key, scopes, expires_at,
       owner_user_id, created_by_user_id, agent_kind
     )
     VALUES (
       $1, $2, $3,
       ARRAY['schema:read', 'records:read', 'records:write', 'records:delete']::text[],
       now() + interval '1 hour', $4, $4, 'personal'
     )
     RETURNING id`,
    [agentName, tokenHash, roleKey, ownerId],
  );
  agentId = createdAgent.rows[0].id;

  client = new Client({ name: "factory-mcp-write-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
    authProvider: { token: async () => token },
  });
  await client.connect(transport);

  const listed = await client.listTools();
  const expectedTools = ["list_entities", "describe_entity", "query_records", "get_record", "list_attachments", "read_attachment", "create_record", "update_record", "delete_record"];
  const names = new Set(listed.tools.map((tool) => tool.name));
  const missing = expectedTools.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Faltan herramientas MCP: ${missing.join(", ")}.`);

  const createKey = `smoke:create:${randomUUID()}`;
  const created = structured(await client.callTool({
    name: "create_record",
    arguments: { entityKey, values: createValues, idempotencyKey: createKey },
  }));
  recordId = created.record?.id;
  if (!recordId || created.idempotent_replay !== false) throw new Error("La creación MCP no devolvió un registro nuevo.");

  const replayed = structured(await client.callTool({
    name: "create_record",
    arguments: { entityKey, values: createValues, idempotencyKey: createKey },
  }));
  if (replayed.record?.id !== recordId || replayed.idempotent_replay !== true) throw new Error("La repetición idempotente no devolvió el mismo registro.");

  const updated = structured(await client.callTool({
    name: "update_record",
    arguments: { entityKey, id: recordId, values: updateValues, idempotencyKey: `smoke:update:${randomUUID()}` },
  }));
  if (updated.record?.id !== recordId) throw new Error("La actualización MCP no devolvió el registro esperado.");

  const fetched = structured(await client.callTool({ name: "get_record", arguments: { entityKey, id: recordId } }));
  if (!fetched.found) throw new Error("El registro actualizado no pudo leerse por MCP.");

  const deleted = structured(await client.callTool({
    name: "delete_record",
    arguments: { entityKey, id: recordId, idempotencyKey: `smoke:delete:${randomUUID()}`, confirm: true },
  }));
  if (!deleted.deleted) throw new Error("La eliminación MCP no fue confirmada.");
  recordId = undefined;

  const afterDelete = structured(await client.callTool({ name: "get_record", arguments: { entityKey, id: deleted.id } }));
  if (afterDelete.found) throw new Error("El registro continuó visible después de eliminarlo.");

  const evidence = await database.query(
    `SELECT
       (SELECT COUNT(*)::int FROM app_agent_event WHERE agent_id = $1 AND status = 'completed') AS events,
       (SELECT COUNT(*)::int FROM app_audit_log WHERE agent_id = $1 AND agent_event_id IS NOT NULL) AS audits,
       (SELECT COUNT(*)::int FROM app_agent_mutation WHERE agent_id = $1) AS mutations,
       (SELECT COUNT(*)::int FROM app_agent_event WHERE agent_id = $1 AND responsible_user_id = $2) AS responsible_events,
       (SELECT COUNT(*)::int FROM app_audit_log WHERE agent_id = $1 AND responsible_user_id = $2) AS responsible_audits`,
    [agentId, ownerId],
  );
  const { events, audits, mutations, responsible_events: responsibleEvents, responsible_audits: responsibleAudits } = evidence.rows[0];
  if (events < 6 || audits !== 3 || mutations !== 3 || responsibleEvents < 6 || responsibleAudits !== 3) {
    throw new Error(
      `Trazabilidad incompleta: eventos=${events}, auditorías=${audits}, mutaciones=${mutations}, `
      + `eventos responsables=${responsibleEvents}, auditorías responsables=${responsibleAudits}.`,
    );
  }
  console.log(`MCP write smoke passed: ${listed.tools.length} tools, ${events} events, ${audits} audited writes, ${mutations} idempotent mutations.`);
} finally {
  if (client) await client.close().catch(() => undefined);
  if (recordId) await database.query(`DELETE FROM "${entityKey}" WHERE id = $1`, [recordId]).catch(() => undefined);
  if (agentId) await database.query("UPDATE app_agent SET active = FALSE WHERE id = $1", [agentId]).catch(() => undefined);
  if (ownerWasCreated && ownerId) {
    await database.query("UPDATE app_user SET active = FALSE WHERE id = $1", [ownerId]).catch(() => undefined);
  }
  await database.end();
}
