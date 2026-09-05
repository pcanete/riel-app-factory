# Convergencia con la implementación de Claude — septiembre de 2026

Referencia examinada: `pcanete/claude-app-factory` en
`ec20de439e816261c18ebb61cab1c2c3a1ed71ca`. No supone que commits posteriores mantengan
los mismos problemas. Comparar contratos y resultados antes de trasladar archivos.

## Cambios implementados en esta línea que conviene portar

1. **Migraciones destructivas.** Bloquear `TRUNCATE … CASCADE` aunque la tabla nombrada
   esté vacía: puede vaciar una tabla hija con filas. Reconocer `ALTER TABLE … DROP campo`
   sin `COLUMN`. Mantener semántica de nombres citados/no citados. Inspección y DDL quedan
   en la misma transacción; el runner usa un advisory lock para evitar dos ejecutores.
   La autorización sigue siendo por nombre exacto de migración, no `*`.
2. **Reintentos MCP.** La repetición devuelve sólo un comprobante de operación aplicada,
   no un registro almacenado. No leer el JSON de resultados históricos en el replay.
   Así reasignar el agente no abre una vía de lectura de datos de su responsable anterior.
   Adaptar el smoke y consumidores que esperaban un `record` en la repetición.
3. **Propiedad de archivos.** Llevar auth/users/settings/MCP genéricos a `src/platform/`,
   preservando puentes de imports anteriores. No reclamar todo `src/features/` ni
   `database/custom/`; identificar explícitamente los archivos históricos de Factory.
4. **Actualizaciones en tres versiones.** Comparar baseline, archivo local y plantilla nueva.
   Distinguir cambio sólo del cliente, cambio sólo de Factory y conflicto. Una base ausente
   bloquea; un archivo desconocido no se adopta automáticamente. Incluir dependencias y
   configuración de raíz. Guardar respaldo, restaurar ante errores y bloquear tras un
   cierre abrupto. Nunca reescribir SQL histórico.

Código principal: `assets/runtime-nextjs/scripts/destructive-guard.mjs`,
`scripts/apply-migrations.mjs` del runtime, `src/platform/mcp/mutations.ts`,
`scripts/platform_files.py` y `scripts/update_platform.py` de Factory.

## Protecciones de esta línea que no conviene perder

- Autorización por acción = permiso del agente **y** del responsable humano actual,
  además del alcance de la credencial. No alcanza con intersectar sólo la visibilidad
  de registros: un agente administrador de una persona lectora no puede escribir.
- Evolución debe detener retiro de `record_access`, cambio de dueño y ampliación de
  `own` a `all`. Los cambios deliberados requieren un proceso separado y revisado.
- Agregar una referencia a usuario por evolución debe crear la FK e índice que existirían
  en una generación inicial equivalente, no solamente una columna UUID.

## Lo positivo tomado de Claude

La idea de probar permisos y migraciones contra PostgreSQL real se convirtió aquí en
una suite propia integrada a CI. No se copiaron APIs incompatibles ni pruebas que sólo
verifican presencia de cadenas en fuentes. La separación explícita de plataforma y
extensiones y el manifiesto también inspiraron el actualizador conservador de esta línea.

## Conformidad mínima compartida

Los dos proyectos deberían pasar los mismos escenarios, aunque sus implementaciones difieran:

- Usuario A ve A y no B en ficha, listas, conteos, exportación, calendario y relaciones.
- A no puede asignar registros a B ni relacionarlos con registros privados de B.
- Agente con rol alto no supera al responsable de rol bajo; responsable inactivo no autentica.
- Reasignación del agente + repetición de clave antigua no filtra el registro histórico.
- Reintentos paralelos iguales ejecutan una sola escritura; misma clave con otro pedido se rechaza.
- Tabla padre vacía con hija poblada + TRUNCATE CASCADE se bloquea sin cambiar filas ni ledger.
- DROP sin COLUMN se bloquea cuando hay valores; sólo autorización exacta lo permite.
- Cambios sólo del cliente sobreviven a actualizaciones sucesivas; los conflictos frenan todo.
- Una adopción sin baseline conocido o una migración histórica editada no se aplica.

Fixtures y pruebas: `scripts/security_fixture.py`, `scripts/test_platform.py`, y
`assets/runtime-nextjs/scripts/test-security-db.mjs` / `test-migrations-db.mjs`.
Usar exclusivamente PostgreSQL descartable con `FACTORY_TEST_DATABASE=1`.

## Todavía no fusionar automáticamente

`person` y `user_reference`, las capacidades administrativas y los manifiestos no son
contratos intercambiables. Acordar una traducción/versionado y probar generación inicial
contra evolución antes de compartir AppSpecs directamente.

OAuth de Claude merece una fase propia: una identidad común de usuario/agente,
autorización equivalente, trazabilidad también en lecturas, límites de uso en ambas
rutas y pruebas de extremo a extremo con el cliente real. Esta entrega no lo porta ni
promete conexión OAuth de ChatGPT en el runtime actual.

No hace falta sumar workflows genéricos, multitenencia ni chat interno para resolver
estos puntos. El objetivo es mantener una base pequeña con contratos verificables.
