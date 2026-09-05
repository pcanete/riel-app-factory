# Acceso de agentes mediante MCP

Este contrato se aplica cuando Riel, Codex, Claude u otro coordinador necesita leer u operar los datos de una aplicación generada. La fábrica y el agente son sistemas separados: la aplicación generada controla autenticación, autorización, datos y auditoría; el agente externo aporta su propio modelo y orquestación.

## Superficie de herramientas

El runtime expone Streamable HTTP sin estado en `/api/mcp` mediante el SDK oficial de MCP para TypeScript.

Herramientas de lectura:

- `list_entities`: descubre entidades autorizadas;
- `describe_entity`: describe campos, relaciones, adjuntos y capacidades;
- `count_records`: cuenta una consulta acotada;
- `query_records`: busca, filtra, ordena y pagina hasta 100 registros;
- `get_record`: obtiene un registro por UUID;
- `list_attachments`: lista metadatos y huellas de adjuntos de un registro autorizado;
- `read_attachment`: devuelve hasta 2 MB de un adjunto autorizado en base64 después de verificar su SHA-256;
- `export_snapshot`: exporta hasta 10 entidades y 100 registros por entidad con huella de contenido.

Herramientas de escritura:

- `create_record`: crea un registro;
- `update_record`: modifica exclusivamente los campos enviados;
- `delete_record`: elimina un registro y sus adjuntos con confirmación explícita.

No se ofrece SQL arbitrario, ejecución de código ni acceso directo a tablas internas. `describe_entity` indica además el nombre escribible (`writeAs`) de cada relación `belongs_to`, para que un agente no tenga que inferirlo.

## Identidad, alcances y autorización

Después de aplicar migraciones, un administrador puede crear, revocar y reactivar conexiones desde `/agents`. La interfaz muestra la credencial una sola vez y prepara adaptadores de presentación para Claude Code, Codex, JSON compatible y configuración HTTP manual. Todos reutilizan la misma identidad, alcances y auditoría del servidor; no crean tipos distintos de agente.

La credencial y los bloques que la contienen se enmascaran por defecto. Los botones de copia entregan el valor completo al portapapeles y el administrador puede revelarlo deliberadamente. Para Codex, el bloque guarda el token en una variable de entorno del usuario y registra el servidor mediante `--bearer-token-env-var`; el proceso de Codex debe reiniciarse para leer una variable nueva. ChatGPT aparece como una integración futura porque sus aplicaciones MCP personalizadas requieren una capa OAuth; no debe presentarse el token Bearer actual como una instalación compatible.

Para automatización o recuperación operativa también está disponible la CLI:

```bash
pnpm mcp:agent:create -- --name "Riel" --role admin --owner-email responsable@example.com --kind service --access write --expires-days 90
```

Los niveles disponibles son:

- `read`: `schema:read` y `records:read`;
- `write`: agrega `records:write` para crear y actualizar;
- `full`: agrega `records:delete`, `settings:read` y `settings:write`.

El token se imprime una sola vez. Guardalo como secreto del agente consumidor; PostgreSQL conserva sólo su hash SHA-256. Cada agente tiene una persona responsable activa y puede ser `personal` o de `service`. Una operación se autoriza únicamente cuando coinciden el alcance de la credencial, el permiso del rol del agente y el permiso del rol actual de su responsable. Desactivar a la persona bloquea inmediatamente la autenticación del agente; al desactivarla desde la aplicación también se suspenden sus agentes personales. Los agentes de servicio activos deben transferirse o desactivarse primero.

Las herramientas `list_settings`, `get_setting`, `set_setting` y `delete_setting` operan la configuración global clave/valor. Leer exige `settings:read`; escribir exige simultáneamente `settings:write` y la capacidad de rol `manage_settings`. Cada cambio queda atribuido al agente y auditado. Esta tabla es para configuración JSON, no para reemplazar entidades de negocio.

Conectá `https://<host>/api/mcp` con `Authorization: Bearer <token>`. En Vercel se admiten automáticamente la URL del deployment, la rama y el dominio estable indicado por `VERCEL_PROJECT_PRODUCTION_URL`. Configurá correctamente `NEXT_PUBLIC_APP_URL` y usá `MCP_ALLOWED_HOSTS` sólo para hosts adicionales explícitos.

## Seguridad de las mutaciones

Cada creación, actualización o eliminación:

- exige `idempotencyKey` única para el agente y la intención;
- rechaza reutilizar la misma clave con una entrada diferente;
- valida campos y relaciones contra AppSpec;
- ejecuta las mismas reglas deterministas que la interfaz humana;
- se realiza en una transacción PostgreSQL;
- registra la mutación en `app_audit_log` con `agent_id` y `agent_event_id`;
- limita la entrada a 100 campos y 64 KB;
- respeta un máximo de 120 herramientas por agente y minuto.

`delete_record` requiere además `records:delete` y `confirm: true`. Cuando una entidad necesite aprobación humana, segregación de funciones o efectos externos, debe añadirse un adaptador específico; no se debe debilitar este núcleo genérico.

Desde la base 0.2, repetir una mutación aplicada devuelve únicamente
`{entityKey, already_applied: true, idempotent_replay: true}`. No vuelve a ejecutar la
escritura ni devuelve el registro histórico. Esto evita que un cambio de responsable
permita leer datos antiguos mediante la caché de idempotencia. Los resultados antiguos
que pudieran quedar almacenados se ignoran; las operaciones nuevas guardan sólo un recibo.
Para conocer el estado actual, usá una herramienta de lectura con los permisos actuales.
Los consumidores que dependían de `record` en una repetición deben adaptarse a este contrato.

## Trazabilidad

Toda llamada crea un `app_agent_event` antes de acceder a registros y finaliza como completada o fallida. Se almacenan agente, responsable humano al momento de la ejecución, herramienta, entidad opcional, resumen acotado de entrada, cantidad de resultados, duración y error. Los valores enviados en una mutación se resumen mediante nombres de campos y una huella; no se guardan credenciales en texto plano ni registros devueltos.

Las mutaciones generan además el mismo evento de auditoría transaccional que una operación humana, enlazado con la identidad, la ejecución MCP y una copia inmutable de la persona responsable.

Desactivá o hacé vencer la credencial en `app_agent` cuando deje de utilizarse. Nunca compartas una misma credencial entre agentes o ambientes independientes.

El runtime base no incluye un asistente embebido. Si un cliente necesita uno, debe agregarse como feature opcional e independiente; MCP funciona sin claves de OpenAI, Anthropic o AI Gateway dentro de la aplicación.
