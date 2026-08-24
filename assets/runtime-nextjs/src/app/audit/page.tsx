import { Pagination } from "@/components/pagination";
import { countActivityEvents, listActivityAgents, listActivityEvents, type ActivitySource, type AuditAction } from "@/lib/audit";
import { requireAuditAccess } from "@/lib/auth";
import { formatValue } from "@/lib/presentation";
import { runtimeSpec } from "@/lib/spec";

export const dynamic = "force-dynamic";

const mutationActions: Array<{ key: AuditAction; label: string }> = [
  { key: "create", label: "Creación" }, { key: "update", label: "Modificación" }, { key: "delete", label: "Eliminación" },
  { key: "attachment_create", label: "Archivo adjuntado" }, { key: "attachment_delete", label: "Archivo eliminado" },
  { key: "user_create", label: "Usuario creado" }, { key: "user_update", label: "Usuario modificado" },
  { key: "user_status", label: "Estado de usuario" }, { key: "user_invite", label: "Invitación enviada" },
  { key: "user_link", label: "Identidad vinculada" }, { key: "application_settings_update", label: "Configuración actualizada" },
  { key: "application_option_update", label: "Opción guardada" }, { key: "application_option_delete", label: "Opción eliminada" },
  { key: "agent_create", label: "Conexión creada" }, { key: "agent_status", label: "Acceso modificado" },
  { key: "agent_owner", label: "Responsable modificado" },
];
const toolActions = ["list_entities", "describe_entity", "list_settings", "get_setting", "set_setting", "delete_setting", "count_records", "query_records", "get_record", "list_attachments", "read_attachment", "export_snapshot", "create_record", "update_record", "delete_record"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; action?: string; source?: string; agent?: string; page?: string }> }) {
  await requireAuditAccess();
  const requested = await searchParams;
  const auditEntities = [
    ...runtimeSpec.entities.map((entity) => ({ key: entity.key, label: entity.label, labelPlural: entity.label_plural })),
    { key: "app_user", label: "Usuario", labelPlural: "Usuarios" },
    { key: "app_setting", label: "Opción", labelPlural: "Opciones" },
    { key: "app_agent", label: "Agente", labelPlural: "Agentes" },
  ];
  const agents = await listActivityAgents();
  const entityKey = auditEntities.some((entity) => entity.key === requested.entity) ? requested.entity : undefined;
  const source = new Set(["human", "agent"]).has(requested.source ?? "") ? requested.source as ActivitySource : undefined;
  const allActions = [...mutationActions.map((item) => item.key), ...toolActions];
  const action = allActions.includes(requested.action ?? "") ? requested.action : undefined;
  const agentId = agents.some((agent) => agent.id === requested.agent) ? requested.agent : undefined;
  const filters = { entityKey, source, action, agentId };
  const pageSize = 50;
  const total = await countActivityEvents(filters);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number(requested.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  const events = await listActivityEvents({ ...filters, limit: pageSize, offset: (page - 1) * pageSize });
  const entityLabels = Object.fromEntries(auditEntities.map((entity) => [entity.key, entity.label]));
  const actionLabels: Record<string, string> = Object.fromEntries(mutationActions.map((item) => [item.key, item.label]));

  return <>
    <div className="page-header"><div><p className="eyebrow">Control interno</p><h1>Actividad y auditoría</h1><p className="subtitle">{total.toLocaleString("es-AR")} eventos humanos y de agentes en una sola trazabilidad.</p></div></div>
    <form className="toolbar">
      <select aria-label="Filtrar por origen" className="control audit-filter" defaultValue={source ?? ""} name="source"><option value="">Todos los orígenes</option><option value="human">Personas</option><option value="agent">Agentes</option></select>
      <select aria-label="Filtrar por agente" className="control audit-filter" defaultValue={agentId ?? ""} name="agent"><option value="">Todos los agentes</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
      <select aria-label="Filtrar por entidad" className="control audit-filter" defaultValue={entityKey ?? ""} name="entity"><option value="">Todas las entidades</option>{auditEntities.map((entity) => <option key={entity.key} value={entity.key}>{entity.labelPlural}</option>)}</select>
      <select aria-label="Filtrar por evento" className="control audit-filter" defaultValue={action ?? ""} name="action"><option value="">Todos los eventos</option><optgroup label="Cambios">{mutationActions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup><optgroup label="Herramientas MCP">{toolActions.map((tool) => <option key={tool} value={tool}>{tool}</option>)}</optgroup></select>
      <button className="button secondary" type="submit">Filtrar</button>
    </form>
    <div className="table-wrap mobile-card-wrap">{events.length ? <table className="audit-table mobile-cards"><thead><tr><th>Fecha</th><th>Origen</th><th>Ejecutado por</th><th>Responsable</th><th>Entidad</th><th>Evento</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>{events.map((event) => <tr key={event.event_key}>
      <td data-label="Fecha">{formatValue(event.created_at, runtimeSpec.app.locale)}</td>
      <td data-label="Origen"><span className={`audit-badge ${event.source === "agent" ? "update" : "create"}`}>{event.source === "agent" ? "Agente" : "Persona"}</span></td>
      <td data-label="Ejecutado por"><div>{event.agent_name ?? event.actor_name ?? "Identidad eliminada"}</div><div className="table-secondary">{event.agent_name ? "MCP" : event.actor_email ?? "—"}</div></td>
      <td data-label="Responsable"><div>{event.responsible_name ?? "Sin asignar"}</div><div className="table-secondary">{event.responsible_email ?? "—"}</div></td>
      <td data-label="Entidad">{event.entity_key ? entityLabels[event.entity_key] ?? event.entity_key : "—"}</td>
      <td data-label="Evento"><code>{actionLabels[event.action] ?? event.action}</code></td>
      <td data-label="Resultado"><span className={`audit-badge ${event.status === "failed" ? "delete" : event.status === "running" ? "update" : "create"}`}>{event.status}</span><div className="table-secondary">{event.record_id ?? (event.result_count === null ? "" : `${event.result_count} resultados`)}{event.duration_ms === null ? "" : ` · ${event.duration_ms} ms`}</div></td>
      <td data-label="Detalle"><details><summary>Ver detalle</summary><pre className="audit-json">{JSON.stringify(event.details, null, 2)}</pre>{event.error_message && <p className="error-text">{event.error_message}</p>}</details></td>
    </tr>)}</tbody></table> : <div className="empty">Todavía no hay actividad para estos filtros.</div>}</div>
    {total > pageSize && <Pagination baseHref="/audit" page={page} pageSize={pageSize} query={requested} total={total} />}
  </>;
}
