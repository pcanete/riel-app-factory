import type { ActivityEvent } from "@/lib/audit";
import { formatValue } from "@/lib/presentation";

type NodeKind = "person" | "agent" | "core" | "entity";

type ActivityNode = {
  key: string;
  kind: NodeKind;
  label: string;
  secondary: string;
  x: number;
  y: number;
  activity: number;
  failed: boolean;
};

type ActivityLink = {
  key: string;
  from: string;
  to: string;
  kind: "responsibility" | "execution" | "result";
  activity: number;
  failed: boolean;
};

type ActivityGraph = {
  nodes: ActivityNode[];
  links: ActivityLink[];
};

const WIDTH = 1040;
const HEIGHT = 440;
const MAX_EVENTS = 24;

function compactLabel(value: string, maximum = 22) {
  const clean = value.trim() || "Sin identificar";
  return clean.length > maximum ? `${clean.slice(0, maximum - 1)}…` : clean;
}

function distributedY(index: number, total: number) {
  if (total <= 1) return HEIGHT / 2;
  const top = 70;
  const bottom = HEIGHT - 115;
  return top + (bottom - top) * index / (total - 1);
}

function activityPath(from: ActivityNode, to: ActivityNode) {
  const bend = Math.max(44, Math.abs(to.x - from.x) * .48);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}

function buildActivityGraph(events: ActivityEvent[], entityLabels: Record<string, string>): ActivityGraph {
  const recent = events.slice(0, MAX_EVENTS);
  const nodeSeed = new Map<string, Omit<ActivityNode, "x" | "y">>();
  const linkSeed = new Map<string, Omit<ActivityLink, "key">>();

  function touchNode(key: string, kind: NodeKind, label: string, secondary: string, failed: boolean) {
    const current = nodeSeed.get(key);
    nodeSeed.set(key, current
      ? { ...current, activity: current.activity + 1, failed: current.failed || failed }
      : { key, kind, label: compactLabel(label), secondary, activity: 1, failed });
  }

  function touchLink(from: string, to: string, kind: ActivityLink["kind"], failed: boolean) {
    const key = `${from}:${to}:${kind}`;
    const current = linkSeed.get(key);
    linkSeed.set(key, current
      ? { ...current, activity: current.activity + 1, failed: current.failed || failed }
      : { from, to, kind, activity: 1, failed });
  }

  touchNode("core", "core", "Núcleo operativo", "actividad auditada", false);

  for (const event of recent) {
    const failed = event.status === "failed";
    const entityKey = `entity:${event.entity_key ?? "system"}`;
    const entityLabel = event.entity_key ? entityLabels[event.entity_key] ?? event.entity_key : "Sistema";
    touchNode(entityKey, "entity", entityLabel, compactLabel(event.action, 26), failed);
    touchLink("core", entityKey, "result", failed);

    if (event.source === "agent") {
      const agentKey = `agent:${event.agent_id ?? event.agent_name ?? "unknown"}`;
      touchNode(agentKey, "agent", event.agent_name ?? "Agente", "ejecutor MCP", failed);
      touchLink(agentKey, "core", "execution", failed);
      if (event.responsible_user_id || event.responsible_name) {
        const personKey = `person:${event.responsible_user_id ?? event.responsible_name}`;
        touchNode(personKey, "person", event.responsible_name ?? "Responsable", "responsable humano", failed);
        touchLink(personKey, agentKey, "responsibility", failed);
      }
    } else {
      const personKey = `person:${event.actor_id ?? event.actor_name ?? "unknown"}`;
      touchNode(personKey, "person", event.actor_name ?? "Persona", "ejecutor humano", failed);
      touchLink(personKey, "core", "execution", failed);
    }
  }

  const groups: Record<NodeKind, Array<Omit<ActivityNode, "x" | "y">>> = {
    person: [], agent: [], core: [], entity: [],
  };
  for (const node of nodeSeed.values()) groups[node.kind].push(node);
  for (const kind of Object.keys(groups) as NodeKind[]) {
    groups[kind].sort((left, right) => right.activity - left.activity || left.label.localeCompare(right.label, "es"));
  }

  const positions: Record<NodeKind, { x: number; maximum: number }> = {
    person: { x: 105, maximum: 5 },
    agent: { x: 330, maximum: 5 },
    core: { x: 565, maximum: 1 },
    entity: { x: 905, maximum: 6 },
  };
  const visibleKeys = new Set<string>();
  const nodes: ActivityNode[] = [];
  for (const kind of ["person", "agent", "core", "entity"] as NodeKind[]) {
    const selected = groups[kind].slice(0, positions[kind].maximum);
    selected.forEach((node, index) => {
      visibleKeys.add(node.key);
      nodes.push({ ...node, x: positions[kind].x, y: distributedY(index, selected.length) });
    });
  }
  const links = [...linkSeed.entries()]
    .filter(([, link]) => visibleKeys.has(link.from) && visibleKeys.has(link.to))
    .map(([key, link]) => ({ key, ...link }))
    .sort((left, right) => left.kind.localeCompare(right.kind) || right.activity - left.activity);

  return { nodes, links };
}

function nodeRadius(node: ActivityNode) {
  if (node.kind === "core") return 43;
  return Math.min(28, 17 + Math.sqrt(node.activity) * 2.5);
}

function eventLabel(event: ActivityEvent, entityLabels: Record<string, string>) {
  const executor = event.agent_name ?? event.actor_name ?? "Identidad eliminada";
  const entity = event.entity_key ? entityLabels[event.entity_key] ?? event.entity_key : "Sistema";
  return { executor, entity };
}

export function AuditActivityMap({
  events,
  entityLabels,
  actionLabels,
  locale,
}: {
  events: ActivityEvent[];
  entityLabels: Record<string, string>;
  actionLabels: Record<string, string>;
  locale?: string;
}) {
  const graph = buildActivityGraph(events, entityLabels);
  const nodeByKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const recent = events.slice(0, 6);
  const agentCount = graph.nodes.filter((node) => node.kind === "agent").length;
  const entityCount = graph.nodes.filter((node) => node.kind === "entity").length;
  const failures = events.slice(0, MAX_EVENTS).filter((event) => event.status === "failed").length;

  return (
    <section className="activity-map" aria-labelledby="activity-map-title">
      <div className="activity-map-header">
        <div>
          <p className="eyebrow">Sistema en movimiento</p>
          <h2 id="activity-map-title">Red de actividad</h2>
          <p className="subtitle">Personas, agentes y datos conectados a partir de los eventos reales del filtro actual.</p>
        </div>
        <div className="activity-map-stats" aria-label="Resumen de la red">
          <span><strong>{Math.min(events.length, MAX_EVENTS)}</strong> eventos</span>
          <span><strong>{agentCount}</strong> agentes</span>
          <span><strong>{entityCount}</strong> destinos</span>
          <span className={failures ? "has-failures" : ""}><strong>{failures}</strong> fallos</span>
        </div>
      </div>

      {events.length ? (
        <div className="activity-map-stage">
          <svg aria-labelledby="activity-map-svg-title activity-map-svg-description" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
            <title id="activity-map-svg-title">Red animada de actividad reciente</title>
            <desc id="activity-map-svg-description">Las personas responsables aparecen a la izquierda, los agentes en el centro y las entidades afectadas a la derecha. Cada conexión proviene del registro de auditoría.</desc>
            <defs>
              <radialGradient id="activity-core-gradient">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity=".72" />
                <stop offset="58%" stopColor="var(--primary)" stopOpacity=".18" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </radialGradient>
              <filter id="activity-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <g className="activity-map-ambient" aria-hidden="true">
              <ellipse cx="565" cy="220" rx="176" ry="147" />
              <ellipse cx="565" cy="220" rx="132" ry="108" />
              <path d="M455 115 C510 145 490 195 565 220 C640 245 620 295 680 325" />
              <path d="M455 325 C515 290 490 245 565 220 C640 195 620 145 680 115" />
            </g>

            <g aria-hidden="true">
              {graph.links.map((link, index) => {
                const from = nodeByKey.get(link.from);
                const to = nodeByKey.get(link.to);
                if (!from || !to) return null;
                const path = activityPath(from, to);
                const width = Math.min(4, 1.2 + Math.log2(link.activity + 1) * .7);
                return <g key={link.key}>
                  <path className="activity-map-link-base" d={path} style={{ strokeWidth: width }} />
                  <path
                    className={`activity-map-link-flow ${link.kind}${link.failed ? " failed" : ""}`}
                    d={path}
                    style={{ animationDelay: `${-index * .37}s`, animationDuration: `${4.8 + index % 4 * .7}s`, strokeWidth: width }}
                  />
                </g>;
              })}
            </g>

            {graph.nodes.map((node, index) => {
              const radius = nodeRadius(node);
              return <g className={`activity-map-node ${node.kind}${node.failed ? " failed" : ""}`} key={node.key} transform={`translate(${node.x} ${node.y})`}>
                <circle className="activity-map-node-pulse" r={radius + 9} style={{ animationDelay: `${-index * .43}s` }} />
                {node.kind === "core" && <circle className="activity-map-core-glow" fill="url(#activity-core-gradient)" r="82" />}
                <circle className="activity-map-node-disc" filter={node.kind === "core" ? "url(#activity-glow)" : undefined} r={radius} />
                <circle className="activity-map-node-dot" r={node.kind === "core" ? 6 : 4} />
                <text className="activity-map-node-label" textAnchor="middle" y={radius + 21}>{node.label}</text>
                <text className="activity-map-node-secondary" textAnchor="middle" y={radius + 36}>{node.secondary}</text>
              </g>;
            })}
          </svg>
          <div className="activity-map-legend" aria-label="Referencias">
            <span><i className="person" /> Persona</span>
            <span><i className="agent" /> Agente</span>
            <span><i className="entity" /> Entidad</span>
            <span><i className="failed" /> Fallo</span>
          </div>
        </div>
      ) : <div className="activity-map-empty"><span />La red se activará cuando existan eventos para estos filtros.</div>}

      {recent.length > 0 && <div className="activity-map-feed" aria-label="Eventos más recientes">
        {recent.map((event) => {
          const label = eventLabel(event, entityLabels);
          return <article className={event.status === "failed" ? "failed" : ""} key={event.event_key}>
            <span className={`activity-map-feed-dot ${event.source}`} />
            <div><strong>{compactLabel(label.executor, 24)}</strong><span>{actionLabels[event.action] ?? event.action} → {compactLabel(label.entity, 22)}</span></div>
            <time>{formatValue(event.created_at, locale)}</time>
          </article>;
        })}
      </div>}
    </section>
  );
}
