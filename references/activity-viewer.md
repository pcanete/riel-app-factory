# Visor de actividad

El visor de `/audit` representa datos reales de la página y filtros actuales. Está
protegido por el mismo permiso view_audit que la tabla. No abre otra vía de acceso.

- Hasta 40 eventos; máximo 5 personas, 5 agentes y 6 destinos dibujados. Los límites
  se informan, y la tabla conserva los restantes registros y su paginación.
- Identidades por ID, no por nombre. La atribución usa el responsable registrado en
  el evento: no se inventa una persona cuando falta esa atribución.
- Selección por clic o teclado, pasos anterior/siguiente y reproducción histórica
  con pausa. Las partículas representan el evento seleccionado, no trabajo en vivo.
- Pausa al ocultar la pestaña. Respeta prefers-reduced-motion, con navegación manual.
- Actualizar vuelve a consultar al servidor; no hay polling, sockets ni llamadas IA.
- El DTO del gráfico excluye correos, detalles, mensajes de error y payloads de registros.
- SVG y React, sin librerías adicionales. El layout y orden son deterministas para SSR.

Pruebas puras: `node scripts/test-activity-graph.mjs` dentro de la app generada.
QA de navegador: vacío, selección por teclado, fallo visible, pasos, pausa, enlace
a fila, refresco con eventos nuevos y viewport móvil sin desbordar toda la página.

Este gráfico es una visualización de auditoría, no un orquestador ni una prueba de
colaboración autónoma entre agentes. Los datos de ejemplo se usan sólo en QA local.
