"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createAgentAction, type AgentCreateState } from "@/app/agents/actions";

type RoleOption = { key: string; label: string };
type OwnerOption = { id: string; name: string; email: string };
type ClientKey = "claude" | "codex" | "json" | "manual" | "chatgpt";
type CopyTarget = "token" | ClientKey;

type ClientGuide = {
  key: ClientKey;
  label: string;
  status: "ready" | "oauth";
  title: string;
  description: string;
  content?: string;
  note: string;
};

const initialState: AgentCreateState = { status: "idle" };

const clientLabels: Array<{ key: ClientKey; label: string; hint: string }> = [
  { key: "claude", label: "Claude Code", hint: "Comando listo" },
  { key: "codex", label: "Codex", hint: "PowerShell" },
  { key: "json", label: "JSON universal", hint: "Editores y apps" },
  { key: "manual", label: "Otro cliente", hint: "URL y header" },
  { key: "chatgpt", label: "ChatGPT", hint: "Requiere OAuth" },
];

function safeConnectionKey(name: string | undefined) {
  const key = (name ?? "factory")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return key || "factory";
}

function masked(value: string, token: string, revealSecrets: boolean) {
  return revealSecrets ? value : value.replaceAll(token, "<CREDENCIAL_INCLUIDA>");
}

export function AgentCreateForm({
  roles,
  owners,
  currentUserId,
}: {
  roles: RoleOption[];
  owners: OwnerOption[];
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState(createAgentAction, initialState);
  const [origin, setOrigin] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientKey>("claude");
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const token = state.token ?? "";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const guides = useMemo<Record<ClientKey, ClientGuide>>(() => {
    const connectionKey = safeConnectionKey(state.agentName);
    const endpoint = origin ? `${origin}/api/mcp` : "/api/mcp";
    const envKey = `FACTORY_${connectionKey.replace(/[^a-z0-9]+/g, "_").toUpperCase()}_MCP_TOKEN`;
    const claudeCommand = `claude mcp add --transport http ${connectionKey} --scope user ${endpoint} --header "Authorization: Bearer ${token}"`;
    const codexCommand = `[Environment]::SetEnvironmentVariable("${envKey}", "${token}", "User")\ncodex mcp add ${connectionKey} --url "${endpoint}" --bearer-token-env-var ${envKey}`;
    const jsonConfig = JSON.stringify({
      mcpServers: {
        [connectionKey]: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    }, null, 2);
    const manualConfig = `URL: ${endpoint}\nHeader: Authorization: Bearer ${token}`;

    return {
      claude: {
        key: "claude",
        label: "Claude Code",
        status: "ready",
        title: "Copiá y pegá un solo comando",
        description: "Abrí PowerShell, pegá el comando y presioná Enter.",
        content: claudeCommand,
        note: "La conexión quedará disponible para tu usuario de Claude Code.",
      },
      codex: {
        key: "codex",
        label: "Codex",
        status: "ready",
        title: "Copiá y pegá el bloque en PowerShell",
        description: "Guarda la credencial en una variable de tu usuario y registra el servidor MCP.",
        content: codexCommand,
        note: "Cerrá y volvé a abrir Codex después de ejecutar el bloque para que lea la variable.",
      },
      json: {
        key: "json",
        label: "JSON universal",
        status: "ready",
        title: "Configuración para clientes compatibles",
        description: "Usá este bloque en editores o aplicaciones que acepten servidores MCP por JSON.",
        content: jsonConfig,
        note: "La ubicación exacta del archivo depende del cliente. Conservá la credencial como secreto.",
      },
      manual: {
        key: "manual",
        label: "Otro cliente",
        status: "ready",
        title: "Datos universales de conexión",
        description: "Cualquier cliente Streamable HTTP necesita esta URL y este encabezado.",
        content: manualConfig,
        note: "Elegí transporte HTTP y enviá el encabezado Authorization en cada solicitud.",
      },
      chatgpt: {
        key: "chatgpt",
        label: "ChatGPT",
        status: "oauth",
        title: "Esta conexión necesita OAuth",
        description: "ChatGPT no usa directamente esta credencial Bearer de instalación. Factory necesita publicar primero su adaptador OAuth.",
        note: "No hay nada que copiar todavía. La identidad, los permisos y la auditoría existentes se reutilizarán cuando agreguemos esa capa.",
      },
    };
  }, [origin, state.agentName, token]);

  const selectedGuide = guides[selectedClient];

  async function copy(value: string, kind: CopyTarget) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className={`agent-create-layout ${state.status === "success" && token ? "has-result" : ""}`}>
      <form action={action} className="form-card agent-create-form">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Nombre de la conexión</span>
            <input className="control" defaultValue="Mi agente" maxLength={120} name="name" required />
            <span className="field-help">Por ejemplo: Asistente legal, Riel o Generador web.</span>
          </label>
          <label className="field">
            <span className="field-label">Rol</span>
            <select className="control" defaultValue="admin" name="role_key">
              {roles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
            </select>
            <span className="field-help">Define sobre qué entidades puede trabajar.</span>
          </label>
          <label className="field">
            <span className="field-label">Persona responsable</span>
            <select className="control" defaultValue={currentUserId} name="owner_user_id" required>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>{owner.name} · {owner.email}</option>
              ))}
            </select>
            <span className="field-help">La actividad del agente quedará atribuida a esta persona.</span>
          </label>
          <label className="field">
            <span className="field-label">Tipo</span>
            <select className="control" defaultValue="personal" name="agent_kind">
              <option value="personal">Personal</option>
              <option value="service">Servicio compartido</option>
            </select>
            <span className="field-help">Los agentes personales se suspenden al desactivar a su responsable.</span>
          </label>
          <label className="field">
            <span className="field-label">Permisos</span>
            <select className="control" defaultValue="write" name="access">
              <option value="read">Sólo consultar</option>
              <option value="write">Consultar y modificar</option>
              <option value="full">Control total, incluso eliminar</option>
            </select>
            <span className="field-help">Recomendado: consultar y modificar.</span>
          </label>
          <label className="field">
            <span className="field-label">Vencimiento</span>
            <select className="control" defaultValue="90" name="expires_days">
              <option value="30">30 días</option>
              <option value="90">90 días</option>
              <option value="180">180 días</option>
              <option value="365">1 año</option>
            </select>
            <span className="field-help">Después deberá crearse una credencial nueva.</span>
          </label>
        </div>
        {state.status === "error" && <div aria-live="polite" className="notice import-error agent-form-notice">{state.message}</div>}
        <div className="form-actions">
          <button className="button" disabled={pending} type="submit">{pending ? "Creando…" : "Crear conexión"}</button>
        </div>
      </form>

      {state.status === "success" && token && (
        <aside aria-live="polite" className="agent-token-card">
          <div className="agent-result-heading">
            <div><p className="eyebrow">Conexión lista</p><h3>{state.agentName}</h3></div>
            <span className="agent-ready-badge">Activa</span>
          </div>
          <p>{state.message}</p>

          <div className="agent-copy-block">
            <div className="agent-copy-heading"><span>Credencial única</span><button className="agent-secret-toggle" onClick={() => setRevealSecrets((current) => !current)} type="button">{revealSecrets ? "Ocultar" : "Mostrar"}</button></div>
            <code>{revealSecrets ? token : `${token.slice(0, 12)}••••••••••••`}</code>
            <button className="button secondary" onClick={() => copy(token, "token")} type="button">{copied === "token" ? "Copiada" : "Copiar credencial"}</button>
          </div>

          <div className="agent-client-section">
            <div><h4>¿Dónde querés usarla?</h4><p className="field-help">La misma conexión funciona con distintos clientes MCP.</p></div>
            <div aria-label="Cliente MCP" className="agent-client-picker" role="tablist">
              {clientLabels.map((client) => (
                <button
                  aria-controls="agent-client-guide"
                  aria-selected={selectedClient === client.key}
                  className="agent-client-option"
                  key={client.key}
                  onClick={() => setSelectedClient(client.key)}
                  role="tab"
                  type="button"
                >
                  <strong>{client.label}</strong>
                  <span>{client.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`agent-client-guide ${selectedGuide.status === "oauth" ? "oauth" : ""}`} id="agent-client-guide" role="tabpanel">
            <div className="agent-guide-status"><span>{selectedGuide.status === "ready" ? "Listo para copiar" : "Próxima capa"}</span></div>
            <h4>{selectedGuide.title}</h4>
            <p>{selectedGuide.description}</p>
            {selectedGuide.content && (
              <>
                <pre><code>{masked(selectedGuide.content, token, revealSecrets)}</code></pre>
                <button className="button" onClick={() => copy(selectedGuide.content ?? "", selectedGuide.key)} type="button">{copied === selectedGuide.key ? "Copiado" : "Copiar configuración lista"}</button>
              </>
            )}
            <p className="field-help">{selectedGuide.note}</p>
          </div>

          <p className="agent-security-note">La credencial no volverá a mostrarse y la base conserva únicamente su hash. Revocala si pudo quedar expuesta.</p>
        </aside>
      )}
    </div>
  );
}
