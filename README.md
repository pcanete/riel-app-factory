# App Factory

App Factory convierte un pedido de negocio en una base operativa de datos independiente para un solo cliente. Modela el pedido como un **AppSpec** y genera código ordinario de Next.js y PostgreSQL: una interfaz humana deliberadamente simple y una superficie MCP autenticada para agentes.

Riel no es la fábrica. Riel puede coordinar agentes que consuman el endpoint MCP de una aplicación generada, pero la fábrica y cada aplicación siguen siendo utilizables de manera independiente. El repositorio y el identificador del skill conservan el nombre histórico `riel-app-factory` por compatibilidad.

## Qué resuelve para una organización

App Factory permite crear una base operativa a medida sin empezar cada sistema desde cero ni forzar al cliente dentro de un CRM, ERP o CMS genérico. Convierte procesos que hoy viven en planillas, correos y herramientas aisladas en una fuente de verdad central, accesible desde una interfaz web sencilla.

Las personas pueden consultar y mantener la información con roles y permisos; los agentes autorizados pueden leerla y operarla mediante MCP; y cada acción conserva trazabilidad sobre quién la ejecutó y qué persona es responsable. Cuando cambia el negocio, la aplicación puede incorporar entidades, campos, vistas, reglas e integraciones sin abandonar su base ni depender de un runtime propietario.

El beneficio práctico es menos información duplicada, menos instalaciones individuales, mayor control sobre los datos y una base preparada para automatizar trabajo con agentes sin perder supervisión humana. Cada cliente conserva su propia aplicación, base de datos, credenciales, despliegue y código fuente.

## Qué genera

- entidades, campos, relaciones, roles y permisos del servidor;
- migraciones PostgreSQL, CRUD auditado, importación, exportación y adjuntos;
- campos de etiquetas múltiples con búsqueda GIN e importación/exportación consistente;
- vistas de tabla, kanban, calendario y dashboard;
- reglas deterministas de validación y mutación;
- autenticación con Clerk y gestión de usuarios de la aplicación;
- referencias opcionales desde registros de dominio a cuentas de usuario, sin mezclar perfiles operativos con identidad y rol;
- seguridad por registro opcional basada en una cuenta responsable, aplicada de forma uniforme a la interfaz, vistas, archivos, importaciones, exportaciones y MCP;
- un visor interactivo de la actividad auditada: red neuronal, selección de personas/agentes/entidades, reproducción histórica con pausa, pasos y enlace al evento original; sin inventar actividad en vivo ni consumir IA;
- configuración clave/valor JSON para opciones no secretas de la aplicación;
- un endpoint MCP sin estado con credenciales por agente, lectura, escritura y eliminación opcional;
- zonas explícitas para extender cada solución sin romper lo generado.

Cada aplicación obtiene su propio repositorio, base de datos, despliegue, credenciales y ciclo de vida. La aplicación generada no llama a App Factory durante su ejecución.

## Inicio rápido

Requisitos: Python 3.11+ para la fábrica; Node.js 24+, pnpm y PostgreSQL para la aplicación generada.

```bash
python scripts/test_scaffold.py
python scripts/scaffold_app.py \
  --spec references/example-maintenance.app-spec.json \
  --output ../maintenance-demo
python scripts/verify_scaffold.py ../maintenance-demo
```

Luego, dentro del directorio generado:

```bash
cp .env.example .env.local
pnpm install
pnpm db:apply
pnpm db:smoke
pnpm dev
```

Usá `ALLOW_UNSAFE_LOCAL_PREVIEW=true` exclusivamente en desarrollo local. Habilita el selector de roles en `/dev-access`; producción siempre ignora esa opción.

## Evolucionar una aplicación existente

Conservá el `app-spec.json` actual y prepará por separado el AppSpec propuesto. Generá primero un plan sin modificar archivos:

```bash
python scripts/evolve_app.py \
  --project ../maintenance-demo \
  --spec ../maintenance-demo.next.app-spec.json
```

Después de revisar el plan, aplicá cambios aditivos seguros con `--apply` y un nombre de migración descriptivo. El comando crea la siguiente migración PostgreSQL inmutable y actualiza únicamente archivos propiedad de la fábrica. Las extensiones del cliente y sus migraciones personalizadas no se sobrescriben. Renombrar, eliminar, cambiar tipos, quitar opciones de un enum o introducir cambios que necesiten backfill detiene el proceso para revisión explícita.

Consultá el [contrato completo de evolución](references/evolution.md).

### Actualizar la base sin pisar el trabajo de cada cliente

Cambiar entidades y actualizar la plataforma son operaciones separadas. Las apps nuevas
incluyen `platform-manifest.json`, que registra las huellas del runtime original. El
actualizador compara esa base, la app actual y la nueva versión de Factory:

```bash
python scripts/check_platform.py --project ../maintenance-demo
python scripts/update_platform.py --project ../maintenance-demo --apply
```

Conserva modificaciones exclusivas del cliente, bloquea conflictos y migraciones
históricas alteradas, y crea un respaldo local antes de modificar código. Si la app no
tiene manifiesto, se detiene: no supone que sus archivos sean reemplazables. Leé el
[procedimiento de actualización y adopción](references/platform-updates.md) antes de aplicarlo.

### Seguridad por registro, sólo cuando el caso la necesita

Una entidad puede declarar `record_access` en AppSpec y definir, para cada rol, alcance `all` o `own`. El alcance `own` hace que una persona vea y opere exclusivamente los registros cuyo campo `user_reference` de propiedad apunta a su cuenta. Un agente hereda además el alcance de su responsable humano; prevalece siempre la restricción más fuerte.

La opción no se activa implícitamente: si `record_access` no existe, la aplicación conserva los permisos por entidad actuales. App Factory tampoco impone aprobaciones ni estados de workflow. Esos procesos pertenecen a `src/features/` y se diseñan para cada implementación real. Hay un ejemplo mínimo en [`references/example-record-access.app-spec.json`](references/example-record-access.app-spec.json).

## Acceso de agentes mediante MCP

Las aplicaciones generadas exponen Streamable HTTP autenticado en `/api/mcp`. Un administrador crea, revoca y reactiva conexiones desde la pantalla `/agents`, que entrega una credencial de un solo uso y un asistente de conexión para Claude Code, Codex, clientes configurables por JSON y cualquier cliente HTTP compatible. La credencial queda oculta por defecto y las configuraciones copiadas incluyen el secreto real sin exponerlo en una captura casual. ChatGPT se identifica por separado porque requiere la futura capa OAuth: la interfaz no promete una compatibilidad Bearer que el backend todavía no ofrece.

La CLI queda disponible para automatización o recuperación, siempre con el menor acceso necesario:

```bash
# Sólo lectura
pnpm mcp:agent:create -- --name "Lector" --role consulta --owner-email responsable@example.com --kind personal --access read --expires-days 90

# Lectura, creación y actualización
pnpm mcp:agent:create -- --name "Operador" --role gestor --owner-email responsable@example.com --kind personal --access write --expires-days 90

# CRUD completo, incluida eliminación
pnpm mcp:agent:create -- --name "Administrador" --role admin --owner-email responsable@example.com --kind service --access full --expires-days 30
```

El token se muestra una sola vez y PostgreSQL conserva únicamente su hash SHA-256. Cada agente pertenece a una persona responsable activa; la autorización intersecta los alcances de la credencial, el rol del agente y el rol actual de esa persona. La auditoría conserva ejecutor y responsable, incluso si luego se reasigna el agente. Cada mutación exige una clave de idempotencia, ejecuta reglas deterministas y registra en la misma transacción la identidad del agente. La eliminación requiere alcance independiente y confirmación explícita. Las conexiones de control total pueden además leer y escribir la tabla clave/valor mediante `settings:read` y `settings:write`, sólo si ambos roles declaran `manage_settings`.

Antes de aplicar una migración, el runner inspecciona operaciones destructivas comunes,
incluido `ALTER TABLE … DROP` sin la palabra `COLUMN`. Si encuentra datos, o una operación
destructiva con `CASCADE`, se detiene. La excepción exige autorización por el nombre exacto
de la migración; no existe una habilitación global. El runner serializa sus ejecuciones
y mantiene inspección y DDL en una transacción. Esta guarda no es un parser SQL completo
ni reemplaza revisar SQL, respaldar los datos y probar su restauración.

Conectá el agente a `https://tu-aplicacion.example/api/mcp` usando `Authorization: Bearer <token>`. Cada herramienta queda registrada en `app_agent_event` sin copiar al log los datos comerciales devueltos.

Consultá el [contrato MCP completo](references/mcp.md).

Con una base descartable o local y el servidor en ejecución, verificá la interoperabilidad completa con el cliente oficial:

```bash
pnpm mcp:smoke:write -- \
  --url http://127.0.0.1:3000/api/mcp \
  --entity equipment \
  --create-values '{"name":"Prueba MCP","status":"active"}' \
  --update-values '{"status":"maintenance"}'
```

La prueba crea una identidad temporal, enumera herramientas y ejecuta crear, repetición idempotente, leer, actualizar y eliminar. Deja la identidad desactivada y conserva los eventos como evidencia de auditoría.

## De la validación local a producción

El camino de producción soportado usa Vercel, Neon PostgreSQL y Clerk, aunque el código generado sigue siendo portable. Un despliegue no se considera completo hasta verificar migraciones, primer administrador, autenticación por invitación, permisos, salud, auditoría y un flujo real en el navegador.

Leé el [procedimiento de producción en Vercel](references/deployment-vercel.md) antes de publicar. Cada aplicación incluye además `RUNTIME.md` y `.env.example` para que siga siendo operable sin este repositorio.

## Límites de arquitectura

- `app-spec.json` es la fuente de verdad de la estructura generada.
- `src/generated/` contiene metadata regenerable; las migraciones en `database/generated/` son inmutables una vez aplicadas.
- `src/platform/` contiene autenticación, usuarios, opciones y MCP compartidos. El manifiesto identifica los archivos de runtime actualizables.
- `src/features/`, `src/components/custom/` y las migraciones propias en `database/custom/` pertenecen al cliente. Sólo se reservan los diez puentes históricos de imports y las siete migraciones históricas 110–170; no se reclama la carpeta completa.
- Regenerar nunca debe sobrescribir comportamiento específico del cliente.
- Integraciones, aprobaciones, escrituras externas y cálculos propios del dominio requieren adaptadores revisados.
- Los workflows son extensiones del cliente: la base aporta identidad, roles, auditoría y seguridad por registro opcional, pero no presume circuitos de aprobación universales.

Consultá [AppSpec v0](references/app-spec-v0.md) y el [contrato de extensiones](references/extension-contract.md).

## Estructura del repositorio

```text
SKILL.md                     Instrucciones del skill para Codex
agents/openai.yaml           Metadatos visibles del skill
references/                  Contratos de AppSpec, extensión y despliegue
scripts/                     Compilador y verificaciones deterministas
assets/runtime-nextjs/       Runtime portable de las aplicaciones generadas
```

## Seguridad y propiedad de los datos

Nunca publiques `.env.local`, credenciales, URLs privadas de base de datos ni secretos de Clerk. `app_setting` admite JSON flexible, pero no es un almacén de secretos: los tokens, contraseñas y claves privadas pertenecen a variables de entorno o al gestor de secretos aprobado.

La copia del código no reemplaza la copia de la base. El código vive en GitHub; los datos, en PostgreSQL; la configuración de despliegue, en el proveedor; y la identidad, en Clerk. Cada capa necesita su propio plan de recuperación.

Consultá [SECURITY.md](SECURITY.md) antes de informar una vulnerabilidad.

## Estado del proyecto

App Factory es una base pública temprana, no un producto no-code alojado, CMS, ERP, CRM ni una promesa automática de preparación para producción. Las contribuciones más valiosas mejoran neutralidad, evolución determinista, uso humano, operación por agentes, portabilidad, seguridad o verificación sin introducir multi-tenencia compartida.

Las contribuciones son bienvenidas; comenzá por [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

[MIT](LICENSE): podés usar, modificar y distribuir el proyecto con atribución y sin garantía.
