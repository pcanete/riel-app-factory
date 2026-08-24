import type { AgentPrincipal } from "@/features/mcp/store";
import type { RuntimeUser } from "@/lib/auth-types";
import type { EntitySpec } from "@/lib/spec";

export type RecordAccessContext = {
  userId: string;
  roleKeys: readonly string[];
};

export type EffectiveRecordScope = "all" | "own" | "none";

export function recordAccessForUser(user: Pick<RuntimeUser, "id" | "roleKey">): RecordAccessContext {
  return { userId: user.id, roleKeys: [user.roleKey] };
}

export function recordAccessForAgent(agent: Pick<AgentPrincipal, "ownerUserId" | "ownerRoleKey" | "roleKey">): RecordAccessContext {
  return { userId: agent.ownerUserId, roleKeys: [agent.roleKey, agent.ownerRoleKey] };
}

export function effectiveRecordScope(entity: EntitySpec, access?: RecordAccessContext): EffectiveRecordScope {
  const policy = entity.record_access;
  if (!policy) return "all";
  if (!access?.userId || !access.roleKeys.length) {
    throw new Error(`La entidad ${entity.key} exige una identidad para aplicar seguridad por registro.`);
  }
  const scopes = [...new Set(access.roleKeys)].map((roleKey) => policy.roles[roleKey]);
  if (scopes.some((scope) => scope !== "all" && scope !== "own")) return "none";
  return scopes.every((scope) => scope === "all") ? "all" : "own";
}

export function prepareRecordCreate(
  entity: EntitySpec,
  values: Record<string, unknown>,
  access?: RecordAccessContext,
) {
  const policy = entity.record_access;
  if (!policy) return values;
  const scope = effectiveRecordScope(entity, access);
  if (scope === "none") throw new Error("El rol actual no tiene alcance sobre registros de esta entidad.");
  if (scope === "all") return values;
  const userId = access!.userId;
  const current = values[policy.owner_field];
  if (current !== undefined && current !== null && current !== "" && current !== userId) {
    throw new Error("No podés crear un registro asignado a otra persona.");
  }
  return { ...values, [policy.owner_field]: userId };
}

export function assertRecordOwnershipChange(
  entity: EntitySpec,
  values: Record<string, unknown>,
  access?: RecordAccessContext,
) {
  const policy = entity.record_access;
  if (!policy || !(policy.owner_field in values)) return;
  const scope = effectiveRecordScope(entity, access);
  if (scope === "none") throw new Error("El rol actual no tiene alcance sobre registros de esta entidad.");
  if (scope === "own" && values[policy.owner_field] !== access!.userId) {
    throw new Error("No podés transferir un registro fuera de tu propio alcance.");
  }
}
