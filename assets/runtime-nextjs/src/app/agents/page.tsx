import { setAgentResponsibilityAction, setAgentStatusAction } from "@/app/agents/actions";
import { AgentCreateForm } from "@/components/agent-create-form";
import { Pagination } from "@/components/pagination";
import { countAgentEvents, listAgentEvents, listManagedAgents } from "@/features/mcp/admin";
import { requireAgentManagementAccess } from "@/lib/auth";
import { listManagedUsers } from "@/features/users/store";
import { formatDateTimeValue } from "@/lib/presentation";
import { runtimeSpec } from "@/lib/spec";

export const dynamic = "force-dynamic";

const successMessages: Record<string, string> = {
  revoked: "El acceso fue revocado inmediatamente.",
  reactivated: "La conexión volvió a estar activa.",
  owner: "La responsabilidad del agente quedó actualizada y auditada.",
};

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; page?: string }>;
}) {
  const actor = await requireAgentManagementAccess();
  const requested = await searchParams;
  const pageSize = 25;
  const total = await countAgentEvents();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number(requested.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  const [agents, events, owners] = await Promise.all([
    listManagedAgents(),
    listAgentEvents({ limit: pageSize, offset: (page - 1) * pageSize }),
    listManagedUsers({ active: true, limit: 200 }),
  ]);
  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Operación mediante MCP</p>
          <h1>Agentes</h1>
          <p className="subtitle">Creá y controlá conexiones para Claude, Riel u otros agentes sin usar la terminal.</p>
        </div>
      </div>
      {requested.error === "not_found" && <div className="notice import-error">La conexión solicitada no existe.</div>}
      {requested.error === "invalid_owner" && <div className="notice import-error">Elegí una persona responsable activa.</div>}
      {requested.error === "owner_required" && <div className="notice import-error">Asigná una persona responsable activa antes de reactivar la conexión.</div>}
      {requested.saved && successMessages[requested.saved] && <div className="notice success">{successMessages[requested.saved]}</div>}

      <section>
        <div className="section-heading"><div><h2>Nueva conexión</h2><p className="subtitle">Elegí qué puede hacer y copiá el acceso listo para usar.</p></div></div>
        <AgentCreateForm
          currentUserId={actor.id}
          owners={owners.map((owner) => ({ id: owner.id, name: owner.displayName, email: owner.email }))}
          roles={runtimeSpec.roles.map((role) => ({ key: role.key, label: role.label }))}
        />
      </section>

      <section>
        <div className="section-heading"><div><h2>Conexiones existentes</h2><p className="subtitle">Revocar corta el acceso inmediatamente sin borrar el historial.</p></div></div>
    <div className="table-wrap mobile-card-wrap">
          {agents.length ? (
            <table className="audit-table mobile-cards">
              <thead><tr><th>Agente</th><th>Responsable</th><th>Rol</th><th>Estado</th><th>Vencimiento</th><th>Último uso</th><th>Llamadas</th><th>Acción</th></tr></thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td data-label="Agente"><strong>{agent.name}</strong><div className="table-secondary">{agent.scopes.join(", ")}</div></td>
                    <td data-label="Responsable">
                      <form action={setAgentResponsibilityAction} className="agent-owner-form">
                        <input name="id" type="hidden" value={agent.id} />
                        <select aria-label={`Responsable de ${agent.name}`} className="control" defaultValue={agent.owner_user_id ?? ""} name="owner_user_id" required>
                          {!agent.owner_user_id && <option value="">Sin asignar</option>}
                          {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>)}
                        </select>
                        <select aria-label={`Tipo de ${agent.name}`} className="control" defaultValue={agent.agent_kind} name="agent_kind">
                          <option value="personal">Personal</option>
                          <option value="service">Servicio</option>
                        </select>
                        <button className="button secondary" type="submit">Guardar</button>
                      </form>
                      <div className="table-secondary">{agent.owner_email ?? "Debe asignarse antes de usar"}</div>
                    </td>
                    <td data-label="Rol">{agent.role_label}</td>
                    <td data-label="Estado"><span className={`user-status ${agent.active ? "on" : "off"}`}>{agent.active ? "Activo" : "Inactivo"}</span></td>
                    <td data-label="Vencimiento">{agent.expires_at ? formatDateTimeValue(agent.expires_at, runtimeSpec.app.locale) : "Sin vencimiento"}</td>
                    <td data-label="Último uso">{agent.last_used_at ? formatDateTimeValue(agent.last_used_at, runtimeSpec.app.locale) : "Nunca"}</td>
                    <td data-label="Llamadas">{agent.event_count}</td>
                    <td data-label="Acción">
                      <form action={setAgentStatusAction}>
                        <input name="id" type="hidden" value={agent.id} />
                        <input name="active" type="hidden" value={agent.active ? "false" : "true"} />
                        <button className={`button ${agent.active ? "danger" : "secondary"}`} type="submit">{agent.active ? "Revocar" : "Reactivar"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">Todavía no hay conexiones. Creá la primera con el formulario de arriba.</div>}
        </div>
      </section>

      <section>
        <div className="section-heading"><h2>Actividad reciente</h2></div>
        <div className="table-wrap mobile-card-wrap">
          {events.length ? (
            <table className="audit-table mobile-cards">
              <thead><tr><th>Fecha</th><th>Agente</th><th>Responsable</th><th>Herramienta</th><th>Entidad</th><th>Estado</th><th>Resultado</th><th>Entrada</th></tr></thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td data-label="Fecha">{formatDateTimeValue(event.started_at, runtimeSpec.app.locale)}</td>
                    <td data-label="Agente">{event.agent_name}</td>
                    <td data-label="Responsable"><div>{event.responsible_name ?? "Sin asignar"}</div><div className="table-secondary">{event.responsible_email ?? "—"}</div></td>
                    <td data-label="Herramienta"><code>{event.tool_name}</code></td>
                    <td data-label="Entidad">{event.entity_key ?? "—"}</td>
                    <td data-label="Estado"><span className={`audit-badge ${event.status === "failed" ? "delete" : event.status === "completed" ? "create" : "update"}`}>{event.status}</span></td>
                    <td data-label="Resultado">{event.result_count ?? "—"}{event.duration_ms === null ? "" : ` · ${event.duration_ms} ms`}</td>
                    <td data-label="Entrada"><details><summary>Ver entrada</summary><pre className="audit-json">{JSON.stringify(event.input_summary, null, 2)}</pre>{event.error_message && <p className="error-text">{event.error_message}</p>}</details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">Todavía no hay actividad de agentes.</div>}
        </div>
        {total > pageSize && <Pagination baseHref="/agents" page={page} pageSize={pageSize} query={requested} total={total} />}
      </section>
    </>
  );
}
