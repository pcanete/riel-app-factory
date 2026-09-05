"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createManagedAgent,
  getManagedAgentForUpdate,
  isManagedAgentId,
  setManagedAgentActive,
  setManagedAgentResponsibility,
  type AgentKind,
} from "@/platform/mcp/admin";
import { isManagedUserId } from "@/platform/users/store";
import { recordAuditEvent } from "@/lib/audit";
import { requireAgentManagementAccess } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { runtimeSpec } from "@/lib/spec";

export type AgentCreateState = {
  status: "idle" | "success" | "error";
  message?: string;
  token?: string;
  agentName?: string;
};

const accessScopes = {
  read: ["schema:read", "records:read"],
  write: ["schema:read", "records:read", "records:write"],
  full: ["schema:read", "records:read", "records:write", "records:delete", "settings:read", "settings:write"],
} as const;

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function refreshAgents() {
  revalidatePath("/agents");
  revalidatePath("/audit");
}

export async function createAgentAction(
  _previous: AgentCreateState,
  formData: FormData,
): Promise<AgentCreateState> {
  const actor = await requireAgentManagementAccess();
  const name = String(formData.get("name") ?? "").trim();
  const roleKey = String(formData.get("role_key") ?? "");
  const access = String(formData.get("access") ?? "write") as keyof typeof accessScopes;
  const ownerUserId = String(formData.get("owner_user_id") ?? "");
  const agentKind = String(formData.get("agent_kind") ?? "personal") as AgentKind;
  const expiresDays = Number(formData.get("expires_days") ?? 90);
  if (!name || name.length > 120) return { status: "error", message: "Ingresá un nombre de hasta 120 caracteres." };
  if (!runtimeSpec.roles.some((role) => role.key === roleKey)) return { status: "error", message: "El rol elegido no es válido." };
  if (!(access in accessScopes)) return { status: "error", message: "El nivel de acceso no es válido." };
  if (!isManagedUserId(ownerUserId)) return { status: "error", message: "Elegí una persona responsable válida." };
  if (agentKind !== "personal" && agentKind !== "service") {
    return { status: "error", message: "El tipo de agente no es válido." };
  }
  if (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 3650) {
    return { status: "error", message: "Elegí un vencimiento válido." };
  }

  const token = `factory_mcp_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1_000).toISOString();
  try {
    await withTransaction(async (client) => {
      const id = await createManagedAgent(client, {
        name,
        roleKey,
        scopes: [...accessScopes[access]],
        tokenHash,
        expiresAt,
        ownerUserId,
        createdByUserId: actor.id,
        agentKind,
      });
      await recordAuditEvent(client, {
        actorId: actor.id,
        entityKey: "app_agent",
        recordId: id,
        action: "agent_create",
        changes: { name, roleKey, access, expiresDays, ownerUserId, agentKind },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "error", message: "Esa persona ya tiene una conexión con ese nombre." };
    if (error instanceof Error && error.message === "AGENT_OWNER_INVALID") {
      return { status: "error", message: "La persona responsable no existe o está inactiva." };
    }
    throw error;
  }
  refreshAgents();
  return {
    status: "success",
    message: "La conexión fue creada. Copiá la credencial ahora: no volverá a mostrarse.",
    token,
    agentName: name,
  };
}

export async function setAgentStatusAction(formData: FormData) {
  const actor = await requireAgentManagementAccess();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!isManagedAgentId(id)) redirect("/agents?error=not_found");
  const outcome = await withTransaction(async (client) => {
    const before = await getManagedAgentForUpdate(client, id);
    if (!before) return "not_found" as const;
    if (active && (!before.owner_user_id || before.owner_active !== true)) return "owner_required" as const;
    const updated = await setManagedAgentActive(client, id, active);
    if (!updated) return "owner_required" as const;
    await recordAuditEvent(client, {
      actorId: actor.id,
      entityKey: "app_agent",
      recordId: id,
      action: "agent_status",
      changes: { name: before.name, before: before.active, after: active },
    });
    return "changed" as const;
  });
  if (outcome === "not_found") redirect("/agents?error=not_found");
  if (outcome === "owner_required") redirect("/agents?error=owner_required");
  refreshAgents();
  redirect(`/agents?saved=${active ? "reactivated" : "revoked"}`);
}

export async function setAgentResponsibilityAction(formData: FormData) {
  const actor = await requireAgentManagementAccess();
  const id = String(formData.get("id") ?? "");
  const ownerUserId = String(formData.get("owner_user_id") ?? "");
  const agentKind = String(formData.get("agent_kind") ?? "") as AgentKind;
  if (!isManagedAgentId(id)) redirect("/agents?error=not_found");
  if (!isManagedUserId(ownerUserId) || (agentKind !== "personal" && agentKind !== "service")) {
    redirect("/agents?error=invalid_owner");
  }
  const outcome = await withTransaction(async (client) => {
    const before = await getManagedAgentForUpdate(client, id);
    if (!before) return "not_found" as const;
    const updated = await setManagedAgentResponsibility(client, id, ownerUserId, agentKind);
    if (!updated) return "invalid_owner" as const;
    await recordAuditEvent(client, {
      actorId: actor.id,
      entityKey: "app_agent",
      recordId: id,
      action: "agent_owner",
      changes: {
        name: before.name,
        before: { ownerUserId: before.owner_user_id, agentKind: before.agent_kind },
        after: { ownerUserId, agentKind },
      },
    });
    return "changed" as const;
  });
  if (outcome === "not_found") redirect("/agents?error=not_found");
  if (outcome === "invalid_owner") redirect("/agents?error=invalid_owner");
  refreshAgents();
  redirect("/agents?saved=owner");
}
