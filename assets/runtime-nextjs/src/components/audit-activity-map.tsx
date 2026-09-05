"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildActivityGraph, eventRoute, graphPath, GRAPH_HEIGHT, GRAPH_WIDTH, type GraphEvent } from "@/lib/activity-graph";

const statusLabels = {completed:"Completado",failed:"Falló",running:"En curso al consultar"};
const cut = (text:string,max=23) => text.length>max ? `${text.slice(0,max-1)}…` : text;

export function AuditActivityMap({events,entityLabels,total,page}: {
  events: GraphEvent[]; entityLabels: Record<string,string>; total: number; page: number;
}) {
  const graph=useMemo(()=>buildActivityGraph(events,entityLabels),[events,entityLabels]);
  const [focus,setFocus]=useState<string|null>(null);
  const [selectedKey,setSelectedKey]=useState<string|null>(null);
  const [playing,setPlaying]=useState(false);
  const [reduced,setReduced]=useState(true);
  const [pending,startTransition]=useTransition();
  const router=useRouter(), uid=useId().replace(/:/g,"");
  const focusedNode=graph.nodes.find(n=>n.key===focus);
  const visibleEvents=useMemo(()=>focusedNode?graph.events.filter(e=>focusedNode.events.includes(e.key)):graph.events,[focusedNode,graph.events]);
  const sequence=useMemo(()=>[...visibleEvents].reverse(),[visibleEvents]);
  const selected=visibleEvents.find(e=>e.key===selectedKey)??visibleEvents[0];
  const index=sequence.findIndex(e=>e.key===selected?.key);
  const route=new Set(selected?eventRoute(selected):[]);
  const points=new Map<string,{x:number;y:number}>([...graph.nodes.map(n=>[n.key,n] as const),["core",{x:570,y:240}]]);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync=()=>{setReduced(media.matches);if(media.matches)setPlaying(false);};
    const hide=()=>{if(document.hidden)setPlaying(false);};
    sync();media.addEventListener("change",sync);document.addEventListener("visibilitychange",hide);
    return ()=>{media.removeEventListener("change",sync);document.removeEventListener("visibilitychange",hide);};
  },[]);
  useEffect(()=>{
    if(!playing||reduced||!selected)return;
    const timer=window.setTimeout(()=>{
      if(index>=sequence.length-1)setPlaying(false);else setSelectedKey(sequence[index+1].key);
    },2600);
    return ()=>window.clearTimeout(timer);
  },[playing,reduced,selected,index,sequence]);
  const selectNode=(key:string)=>{setPlaying(false);setSelectedKey(null);setFocus(focus===key?null:key);};
  const play=()=>{
    if(playing){setPlaying(false);return;}
    if(index>=sequence.length-1)setSelectedKey(sequence[0]?.key??null);
    setPlaying(true);
  };
  return <section className={`neural-view ${playing&&!reduced?"is-playing":"is-paused"}`} aria-labelledby={`${uid}-title`}>
    <header className="neural-header"><div><p className="eyebrow">Personas · agentes · datos</p><h2 id={`${uid}-title`}>El pulso de la operación</h2><p className="subtitle">Una red de actividad real. Elegí un nodo para seguir su recorrido.</p></div>
      <button className="button secondary" type="button" disabled={pending} onClick={()=>{setPlaying(false);startTransition(()=>router.refresh());}}>{pending?"Actualizando…":"↻ Actualizar"}</button></header>
    <div className="neural-metrics" aria-label="Resumen del historial representado"><span><strong>{graph.events.length}</strong> eventos representados</span><span><strong>{graph.counts.person}</strong> personas</span><span><strong>{graph.counts.agent}</strong> agentes</span><span><strong>{graph.counts.entity}</strong> destinos</span><span className={graph.failures?"has-failures":""}><strong>{graph.failures}</strong> fallos</span></div>
    {!graph.events.length ? <div className="neural-empty">Todavía no hay actividad para estos filtros. La red aparecerá con los primeros eventos.</div> : <>
      <div className="neural-workspace"><div className="neural-scroll" role="region" aria-label="Red interactiva; desplazamiento horizontal disponible" tabIndex={0}>
        <svg className="neural-canvas" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="group" aria-label="Personas responsables, agentes y entidades; los nodos son seleccionables">
          <defs><radialGradient id={`${uid}-halo`}><stop stopColor="var(--primary)" stopOpacity=".26"/><stop offset="1" stopColor="var(--primary)" stopOpacity="0"/></radialGradient></defs>
          <g className="neural-column-labels" aria-hidden="true"><text x="90" y="26" textAnchor="middle">PERSONAS</text><text x="310" y="26" textAnchor="middle">AGENTES</text><text x="570" y="26" textAnchor="middle">NÚCLEO OPERATIVO</text><text x="955" y="26" textAnchor="middle">DATOS</text></g>
          <circle cx="570" cy="240" r="190" fill={`url(#${uid}-halo)`}/>
          <g className="neural-brain" aria-hidden="true">{[-1,1].map(side=><g key={side} transform={`translate(570 240) scale(${side} 1)`}>
            <path d="M 8 -74 C 32 -115 88 -83 82 -52 C 131 -42 128 5 99 26 C 115 71 55 101 23 76 C 6 64 8 19 8 -74 Z"/>
            <path d="M 28 -70 C 58 -59 40 -33 79 -26 M 13 -23 C 44 -29 38 7 92 13 M 14 26 C 55 18 44 53 68 64 M 47 -46 C 70 -75 81 -51 81 -51"/>
            {[[31,-68],[77,-27],[42,5],[84,26],[30,60]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3" style={{animationDelay:`${i*.24}s`}}/>)}</g>)}<circle className="neural-ring" cx="570" cy="240" r="112"/></g>
          {graph.edges.map(edge=>{const active=Boolean(selected&&edge.events.includes(selected.key)),path=graphPath(points.get(edge.from)!,points.get(edge.to)!);
            return <g key={edge.key} aria-hidden="true" className={`neural-edge ${active?"selected":""} ${active&&selected?.status==="failed"?"failed":""}`}><path d={path} style={{strokeWidth:Math.min(3.2,1+Math.log2(edge.events.length+1)*.4)}}/>
              {active&&playing&&!reduced&&<circle key={selected.key} r="4" className="neural-particle"><animateMotion dur="2.2s" repeatCount="1" path={path} fill="freeze"/></circle>}</g>;})}
          {graph.nodes.map(node=><g key={node.key} role="button" tabIndex={0} aria-pressed={focus===node.key} aria-label={`${node.label}: ${node.events.length} eventos, ${node.failures} fallos. Filtrar recorrido`}
            onClick={()=>selectNode(node.key)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectNode(node.key);}}}
            className={`neural-node ${node.kind} ${route.has(node.key)?"selected":""} ${focus===node.key?"focused":""}`} transform={`translate(${node.x} ${node.y})`}>
            <title>{`${node.label} · ${node.events.length} eventos · ${node.failures} fallos`}</title><circle className="neural-node-halo" r="33"/><circle className="neural-node-body" r="23"/><circle className="neural-node-dot" r="5"/>
            {node.failures>0&&<circle className="neural-failure-dot" cx="18" cy="-18" r="5"/>}<text className="neural-node-label" textAnchor={node.kind==="entity"?"end":"middle"} x={node.kind==="entity"?-42:0} y={node.kind==="entity"?-4:44}>{cut(node.label)}</text><text className="neural-node-detail" textAnchor={node.kind==="entity"?"end":"middle"} x={node.kind==="entity"?-42:0} y={node.kind==="entity"?14:60}>{node.events.length} eventos{node.failures?` · ${node.failures} fallos`:""}</text></g>)}
          <text className="neural-core-caption" x="570" y="387" textAnchor="middle">Una fuente de verdad</text><text className="neural-core-note" x="570" y="407" textAnchor="middle">Cada acción conserva su responsable</text>
        </svg></div>
        <aside className="neural-inspector" aria-label="Detalle del evento seleccionado"><p className="eyebrow">{playing?"Reproduciendo historial":"Evento seleccionado"}</p>
          {selected&&<><span className={`neural-status ${selected.status}`}>{statusLabels[selected.status]}</span><h3>{selected.action}</h3><p className="neural-destination">{entityLabels[selected.entity??""]??selected.entity??"Sistema"}</p>
            <dl><dt>Ejecutó</dt><dd>{selected.actor}<small>{selected.source==="agent"?"Agente MCP":"Persona"}</small></dd><dt>Responsable</dt><dd>{selected.responsible??(selected.source==="human"?selected.actor:"No registrado")}</dd><dt>Fecha del evento</dt><dd><time dateTime={selected.timestamp}>{selected.timeLabel}</time></dd>{selected.duration!==null&&<><dt>Duración registrada</dt><dd>{selected.duration} ms</dd></>}</dl>
            <a className="neural-detail-link" href={`#event-${encodeURIComponent(selected.key)}`}>Ver fila de auditoría ↓</a></>}</aside></div>
      <div className="neural-controls"><button className="button" type="button" disabled={reduced||!sequence.length} onClick={play}>{playing?"Ⅱ Pausar":"▶ Reproducir historial"}</button>
        <button className="button secondary" type="button" disabled={index<=0} onClick={()=>{setPlaying(false);setSelectedKey(sequence[index-1].key);}}>← Anterior</button><button className="button secondary" type="button" disabled={index>=sequence.length-1} onClick={()=>{setPlaying(false);setSelectedKey(sequence[index+1].key);}}>Siguiente →</button><span>{index+1} / {sequence.length}</span>
        {focus&&<button className="button secondary" type="button" onClick={()=>{setFocus(null);setPlaying(false);}}>Quitar selección</button>}</div>
      <div className="neural-timeline" aria-label="Elegir evento del historial">{sequence.map((event,i)=><button type="button" key={event.key} className={`${event.status} ${event.key===selected?.key?"selected":""}`} aria-pressed={event.key===selected?.key}
        aria-label={`Evento ${i+1}: ${event.actor}, ${event.action}, ${statusLabels[event.status]}, ${event.timeLabel}`} title={`${event.actor} · ${event.action} · ${event.timeLabel}`} onClick={()=>{setPlaying(false);setSelectedKey(event.key);}}/>)}</div>
    </>}
    <footer className="neural-footer"><span><i className="person"/>Persona <i className="agent"/>Agente <i className="entity"/>Destino <i className="failed"/>Fallo</span><p>Historial, no actividad en vivo. Las animaciones no ejecutan acciones. {graph.events.length} eventos de la página {page} · {total} en el filtro.{graph.hidden>0?` ${graph.hidden} nodos no dibujados por espacio; todos los eventos siguen en la tabla.`:""}{reduced?" Movimiento reducido activado; usá los controles de pasos.":""}</p></footer>
  </section>;
}
