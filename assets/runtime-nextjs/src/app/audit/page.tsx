import { Pagination } from "@/components/pagination";
import { countAuditEvents, listAuditEvents, type AuditAction } from "@/lib/audit";
import { requireAuditAccess } from "@/lib/auth";
import { formatValue } from "@/lib/presentation";
import { runtimeSpec } from "@/lib/spec";

export const dynamic = "force-dynamic";

const actions: Array<{ key: AuditAction; label: string }> = [
  { key: "create", label: "Creación" },
  { key: "update", label: "Modificación" },
  { key: "delete", label: "Eliminación" },
  { key: "attachment_create", label: "Archivo adjuntado" },
  { key: "attachment_delete", label: "Archivo eliminado" },
  { key: "user_create", label: "Usuario creado" },
  { key: "user_update", label: "Usuario modificado" },
  { key: "user_status", label: "Estado de usuario" },
  { key: "user_invite", label: "Invitación enviada" },
  { key: "user_link", label: "Identidad vinculada" },
  { key: "application_settings_update", label: "Configuración actualizada" },
  { key: "application_option_update", label: "Opción guardada" },
  { key: "application_option_delete", label: "Opción eliminada" },
  { key: "agent_create", label: "Conexión de agente creada" },
  { key: "agent_status", label: "Acceso de agente modificado" },
  { key: "agent_owner", label: "Responsable de agente modificado" },
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; page?: string }>;
}) {
  await requireAuditAccess();
  const requested = await searchParams;
  const auditEntities = [
    ...runtimeSpec.entities.map((entity) => ({ key: entity.key, label: entity.label, labelPlural: entity.label_plural })),
    { key: "app_user", label: "Usuario", labelPlural: "Usuarios" },
    { key: "app_setting", label: "Opción", labelPlural: "Opciones" },
    { key: "app_agent", label: "Agente", labelPlural: "Agentes" },
  ];
  const entityKey = auditEntities.some((entity) => entity.key === requested.entity)
    ? requested.entity
    : undefined;
  const action = actions.some((candidate) => candidate.key === requested.action)
    ? requested.action as AuditAction
    : undefined;
  const pageSize = 50;
  const total = await countAuditEvents({ entityKey, action });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number(requested.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  const events = await listAuditEvents({ entityKey, action, limit: pageSize, offset: (page - 1) * pageSize });
  const entityLabels = Object.fromEntries(auditEntities.map((entity) => [entity.key, entity.label]));
  const actionLabels = Object.fromEntries(actions.map((candidate) => [candidate.key, candidate.label]));

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Control interno</p>
          <h1>Auditoría</h1>
          <p className="subtitle">{total.toLocaleString("es-AR")} cambios registrados por el runtime.</p>
        </div>
      </div>
      <form className="toolbar">
        <select aria-label="Filtrar por entidad" className="control audit-filter" defaultValue={entityKey ?? ""} name="entity">
          <option value="">Todas las entidades</option>
          {auditEntities.map((entity) => (
            <option key={entity.key} value={entity.key}>{entity.labelPlural}</option>
          ))}
        </select>
        <select aria-label="Filtrar por acción" className="control audit-filter" defaultValue={action ?? ""} name="action">
          <option value="">Todas las acciones</option>
          {actions.map((candidate) => (
            <option key={candidate.key} value={candidate.key}>{candidate.label}</option>
          ))}
        </select>
        <button className="button secondary" type="submit">Filtrar</button>
      </form>
    <div className="table-wrap mobile-card-wrap">
        {events.length ? (
          <table className="audit-table mobile-cards">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Ejecutado por</th>
                <th>Responsable</th>
                <th>Entidad</th>
                <th>Acción</th>
                <th>Registro</th>
                <th>Cambios</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td data-label="Fecha">{formatValue(event.created_at, runtimeSpec.app.locale)}</td>
                  <td data-label="Ejecutado por">
                    <div>{event.agent_name ? `Agente: ${event.agent_name}` : event.actor_name ?? "Identidad eliminada"}</div>
                    <div className="table-secondary">{event.agent_id ? "MCP" : event.actor_email ?? "—"}</div>
                  </td>
                  <td data-label="Responsable">
                    <div>{event.responsible_name ?? "Responsabilidad no asignada"}</div>
                    <div className="table-secondary">{event.responsible_email ?? "—"}</div>
                  </td>
                  <td data-label="Entidad">{entityLabels[event.entity_key] ?? event.entity_key}</td>
                  <td data-label="Acción"><span className={`audit-badge ${event.action}`}>{actionLabels[event.action]}</span></td>
                  <td data-label="Registro"><code className="record-id">{event.record_id ?? "—"}</code></td>
                  <td data-label="Cambios">
                    <details>
                      <summary>Ver cambios</summary>
                      <pre className="audit-json">{JSON.stringify(event.changes, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Todavía no hay eventos de auditoría para estos filtros.</div>}
      </div>
      {total > pageSize && <Pagination baseHref="/audit" page={page} pageSize={pageSize} query={requested} total={total} />}
    </>
  );
}
