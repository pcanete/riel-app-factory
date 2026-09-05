# Validación de actualización y visor — 2026-09-05

Alcance: únicamente Factory Codex y Mesa de Expedientes. El checkout de Claude
ec20de4 se consultó como referencia de diseño; no se modificó ni publicó allí.

## Antes del despliegue

- Compiler: 33 pruebas; evolución: 13; actualizador: 15. Todas aprobadas.
- Políticas puras, guarda destructiva y modelo del grafo: aprobadas.
- Mesa: TypeScript y build Next.js 16.3.1 aprobados.
- PostgreSQL 17 local descartable: SQL histórico de Mesa aplicado dos veces;
  CRUD de las cinco entidades aprobado con rollback.
- Fixture de seguridad en PostgreSQL: aislamiento, relaciones, techo del responsable,
  responsable inactivo, replay y concurrencia aprobados; guardas de migraciones,
  exclusión del runner y rollback aprobados.
- MCP HTTP local: 15 herramientas, seis eventos, tres escrituras auditadas y tres
  mutaciones idempotentes aprobadas. La primera prueba rechazó correctamente un alta
  sin el campo obligatorio Código; se corrigió el dato de prueba y se repitió.
- Visor local con datos sintéticos: vacío, actualizar, reproducción y pausa,
  selección de agente por Enter, pasos, detalle de fallo y enlace a TR aprobado.
- Viewports 1440 y 390: el scroll horizontal queda dentro del gráfico, sin desbordar
  la página. Movimiento reducido está implementado por CSS y matchMedia; no se
  forzó la preferencia del sistema durante esta prueba.
- Una recarga completa detectó un título SVG con múltiples nodos de texto. Se
  corrigió a una sola cadena; la nueva recarga en navegador sin extensiones no
  produjo errores de consola. Chrome del usuario sí inyecta bis_skin_checked y
  otras marcas, que generan advertencias ajenas a este componente.

## Preservación de Mesa

Sin cambios en AppSpec, src/generated ni SQL existente. La reconciliación histórica
está detallada en PLATFORM_UPGRADE_2026-09-05.md de Mesa. El chequeo de plataforma
admite aplicar, conserva las excepciones locales y no reescribe SQL histórico.
Git respalda código; no reemplaza el respaldo de PostgreSQL ni de adjuntos externos.

## Producción verificada

- Runtime Factory: `ed3350a2326215c68b0434e2fcd887166dcd4f6e`.
- Mesa publicada en main: `13100972c1816cf8bcebeb657f1bf6a030999bd0`.
- Vercel: `dpl_AnKkSAsTnxXc3dZ9xvPVXAyReGQt`, target production, estado READY,
  proyecto prj_TyAo8zRGoXWiNQMT1Y3JVtk6l7V5, alias mesa-expedientes-demo.vercel.app.
- Fuente: 137 archivos leídos de blobs Git comprometidos, sin entornos privados.
  El conector no conservó los metadatos Git personalizados; esta correspondencia
  documenta explícitamente la fuente enviada, no una atribución inferida de Vercel.
- Intervalo buildingAt → ready: 22,2 s. Next.js 16.3.1.
- Health HTTP 200; MCP sin token HTTP 401; sesión humana autenticada operativa.
- Auditoría conserva 234 eventos. Selección de agente por teclado, reproducción
  histórica y calendario con eventos reales verificados sin editar registros.
- Build: todas las migraciones existentes omitidas (skip), administrador existente.
- Consulta de respuestas 5xx del despliegue durante QA: ninguna registrada.
- GitHub Actions del runtime: cinco jobs aprobados, run 33968780566.
- La QA real detectó superposición de etiquetas con seis destinos; se corrigió
  moviéndolas al costado y se verificó el segundo despliegue.

Advertencias no bloqueantes existentes: instancia Clerk de desarrollo y aviso de pg
sobre futuros cambios de semántica de sslmode. No se cambió Clerk ni la política TLS.
Antes de una actualización mayor de pg conviene explicitar verify-full y verificar
compatibilidad del proveedor. No se desactivó la validación de certificados.

No se hizo una nueva escritura MCP en producción: la prueba CRUD HTTP completa fue
local y descartable. No se configuró monitoreo periódico automático.
