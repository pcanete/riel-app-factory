// Pure, bounded view model: no business payloads or credentials.
export type GraphEvent = {
  key: string; source: "human" | "agent"; actorId: string | null; actor: string;
  agentId: string | null; responsibleId: string | null; responsible: string | null;
  entity: string | null; action: string; status: "completed" | "failed" | "running";
  timestamp: string; timeLabel: string; duration: number | null;
};
export type GraphNode = {
  key: string; kind: "person" | "agent" | "entity"; label: string;
  events: string[]; failures: number; x: number; y: number;
};
export const GRAPH_LIMIT = 40;
export const GRAPH_WIDTH = 1080;
export const GRAPH_HEIGHT = 510;
export function eventRoute(event: GraphEvent): string[] {
  const actor = event.source === "agent" ? `agent:${event.agentId ?? event.key}` : `person:${event.actorId ?? event.key}`;
  const owner = event.source === "agent" && event.responsibleId ? [`person:${event.responsibleId}`] : [];
  return [...owner, actor, "core", `entity:${event.entity ?? "system"}`];
}
export function buildActivityGraph(input: GraphEvent[], labels: Record<string, string>) {
  const events = [...new Map(input.map(event => [event.key, event])).values()]
    .sort((a,b) => b.timestamp.localeCompare(a.timestamp) || a.key.localeCompare(b.key)).slice(0, GRAPH_LIMIT);
  const seeds = new Map<string, GraphNode>();
  const edges = new Map<string, {key: string; from: string; to: string; events: string[]}>();
  const touch = (key: string, kind: GraphNode["kind"], label: string, event: GraphEvent) => {
    const node = seeds.get(key) ?? {key, kind, label, events: [], failures: 0, x: 0, y: 0};
    node.events.push(event.key); node.failures += Number(event.status === "failed"); seeds.set(key,node);
  };
  for (const event of events) {
    const route = eventRoute(event);
    for (const key of route) {
      if (key === "core") continue;
      const kind = key.startsWith("entity:") ? "entity" : key.startsWith("agent:") ? "agent" : "person";
      const label = kind === "entity" ? labels[event.entity ?? ""] ?? event.entity ?? "Sistema"
        : kind === "person" && event.source === "agent" ? event.responsible ?? "Responsable" : event.actor;
      touch(key,kind,label,event);
    }
    for (let i=1;i<route.length;i++) {
      const key = `${route[i-1]}→${route[i]}`;
      const edge = edges.get(key) ?? {key,from:route[i-1],to:route[i],events:[]};
      edge.events.push(event.key); edges.set(key,edge);
    }
  }
  const counts = {person:0,agent:0,entity:0};
  const nodes: GraphNode[] = [];
  for (const kind of ["person","agent","entity"] as const) {
    const group = [...seeds.values()].filter(n=>n.kind===kind).sort((a,b)=>b.events.length-a.events.length || a.key.localeCompare(b.key));
    counts[kind] = group.length;
    const shown = group.slice(0, kind === "entity" ? 6 : 5);
    shown.forEach((node,i)=>{
      const y=shown.length===1?240:74+i*340/(shown.length-1), curve=Math.cos((y-240)/190)*32;
      nodes.push({...node,x:kind==="person"?120-curve:kind==="agent"?335-curve:935+curve,y});
    });
  }
  const visible = new Set(["core",...nodes.map(n=>n.key)]);
  return {events,nodes,counts,hidden:seeds.size-nodes.length,
    edges:[...edges.values()].filter(e=>visible.has(e.from)&&visible.has(e.to)),
    failures:events.filter(e=>e.status==="failed").length};
}
export function graphPath(a: {x:number;y:number}, b: {x:number;y:number}) {
  const bend=Math.abs(b.x-a.x)*.48;
  return `M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${b.x-bend} ${b.y}, ${b.x} ${b.y}`;
}
