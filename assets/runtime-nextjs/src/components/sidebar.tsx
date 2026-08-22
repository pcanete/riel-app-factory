import Link from "next/link";
import { clearDevelopmentRoleAction } from "@/app/dev-access/actions";
import { SessionSignOut } from "@/components/session-sign-out";
import { clerkAuthConfigured } from "@/features/auth/config";
import { canManageAgents, canManageSettings, canManageUsers, canViewAudit, canViewRules, getCurrentUser, hasPermission, hasViewAccess } from "@/lib/auth";
import { localPreviewAuthEnabled } from "@/lib/runtime-access";
import { runtimeSpec } from "@/lib/spec";

export async function Sidebar() {
  const user = await getCurrentUser();
  const entityLinks = runtimeSpec.entities
    .filter((entity) => user && hasPermission(user, entity.key, "list"))
    .map((entity) => ({ key: entity.key, label: entity.label_plural, href: `/records/${entity.key}` }));
  const entityLabels = new Set(entityLinks.map((link) => link.label.toLocaleLowerCase(runtimeSpec.app.locale ?? "es-AR")));
  const viewLinks = runtimeSpec.views
    .filter((view) => view.navigation && ["table", "kanban", "calendar", "dashboard"].includes(view.type))
    .filter((view) => user && hasViewAccess(user, view))
    .filter((view) => !(view.type === "table" && entityLabels.has(view.label.toLocaleLowerCase(runtimeSpec.app.locale ?? "es-AR"))))
    .map((view) => ({ key: view.key, label: view.label, href: `/views/${view.key}` }));
  const systemLinks = [
    ...(user && canManageSettings(user) ? [{ key: "settings", label: "Configuración", href: "/settings" }] : []),
    ...(user && canManageUsers(user) ? [{ key: "users", label: "Usuarios", href: "/users" }] : []),
    ...(user && canManageAgents(user) ? [{ key: "agents", label: "Agentes", href: "/agents" }] : []),
    ...(user && canViewAudit(user) ? [{ key: "audit", label: "Auditoría", href: "/audit" }] : []),
    ...(user && canViewRules(user) ? [{ key: "rules", label: "Reglas", href: "/rules" }] : []),
  ];

  return (
    <aside className="sidebar">
      <input aria-label="Mostrar u ocultar la navegación" className="nav-switch" id="nav-switch" type="checkbox" />
      <label className="nav-toggle" htmlFor="nav-switch">
        <div className="brand">
          <div className="brand-name">{runtimeSpec.app.name}</div>
          <div className="brand-description">{runtimeSpec.app.description}</div>
        </div>
        <span aria-hidden="true" className="nav-toggle-icon" />
      </label>
      <nav className="nav" aria-label="Navegación principal">
        <Link className="nav-link home" href="/">Resumen</Link>
        {entityLinks.length > 0 && <div className="nav-section">Datos</div>}
        {entityLinks.map((link) => (
          <Link className="nav-link" href={link.href} key={link.key}>{link.label}</Link>
        ))}
        {viewLinks.length > 0 && <div className="nav-section">Vistas</div>}
        {viewLinks.map((link) => (
          <Link className="nav-link" href={link.href} key={link.key}>{link.label}</Link>
        ))}
        {systemLinks.length > 0 && <div className="nav-section">Sistema</div>}
        {systemLinks.map((link) => (
          <Link className="nav-link" href={link.href} key={link.key}>{link.label}</Link>
        ))}
      </nav>
      <div className="session-panel">
        {user ? (
          <>
            <div className="session-name">{user.displayName}</div>
            <div className="session-email">{user.email}</div>
            {localPreviewAuthEnabled() && (
              <form action={clearDevelopmentRoleAction}>
                <button className="session-action" type="submit">Cambiar rol</button>
              </form>
            )}
            {!localPreviewAuthEnabled() && clerkAuthConfigured() && <SessionSignOut />}
          </>
        ) : (
          <Link className="session-action" href={localPreviewAuthEnabled() ? "/dev-access" : "/sign-in"}>Acceder</Link>
        )}
      </div>
    </aside>
  );
}
