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

Las pruebas locales no certifican por sí solas producción: al desplegar se debe
confirmar READY, health, sesión real, auditoría y errores runtime en Vercel.
