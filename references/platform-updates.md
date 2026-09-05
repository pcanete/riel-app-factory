# Actualizaciones seguras de plataforma

Hay dos contratos independientes: `app-spec.json` describe el dominio y evoluciona con
`evolve_app.py`; `platform-manifest.json` describe las huellas de la base Factory y
evoluciona con `update_platform.py`. Ninguno de esos comandos despliega una aplicación.

## Antes de empezar

Trabajá en una rama de la aplicación, con el árbol sin cambios pendientes y un respaldo
del código. Probá primero en una copia o preview. Una actualización de archivos no
autoriza conexiones, migraciones ni escrituras en producción. Conservá acceso a la
versión de Factory que originó la app.

```bash
python /ruta/factory/scripts/check_platform.py --project /ruta/app
python /ruta/factory/scripts/update_platform.py --project /ruta/app --apply
```

El primer comando sólo inspecciona. El segundo vuelve a comparar antes de escribir y
aplica únicamente un plan sin bloqueos. Ambos entregan JSON y códigos de salida:
`0` plan aplicable/completado, `1` plan con bloqueos y `2` error de uso o ejecución.

## Qué significa el plan

| Estado | Resultado |
| --- | --- |
| `UNCHANGED` | El archivo ya coincide con la nueva base. |
| `UPDATE`, `ADD`, `DELETE` | Sólo cambió Factory; puede aplicarse. |
| `CLIENT_MODIFIED`, `CLIENT_DELETED` | Sólo cambió el cliente; se conserva. |
| `CONFLICT` | Cambiaron ambos, o el archivo nuevo colisiona con uno sin historial; se bloquea todo. |
| `UNKNOWN_BASELINE` | No hay manifiesto; no se infiere propiedad ni se actualiza. |
| `MIGRATION_REVIEW` | Factory intenta alterar/eliminar un SQL histórico; se bloquea. |

Los archivos desconocidos se conservan y no pasan a ser propiedad de Factory por el
solo hecho de existir. El manifiesto nuevo registra la versión entrante de Factory,
no el contenido modificado del cliente: así una personalización sigue siendo visible
en la actualización siguiente. Normaliza CRLF/LF en texto UTF-8; conserva bytes de binarios.

No existe `--force`. Un conflicto exige integrar el cambio explícitamente y volver a
planificar. No se debe editar un hash para ocultarlo. Si un archivo de dominio importaba
un módulo histórico de `src/features/auth`, `users`, `settings` o `mcp`, los diez puentes
de compatibilidad de Factory siguen exportándolo desde `src/platform/`.

## Aplicaciones anteriores sin manifiesto

No es seguro crear el baseline desde los archivos actuales: podrían tener cambios propios.
Usá un checkout histórico exacto, revisado y fijado a un commit de la Factory original:

```bash
python /ruta/factory/scripts/update_platform.py --project /ruta/app --adopt-from /ruta/factory-historica
python /ruta/factory/scripts/update_platform.py --project /ruta/app --adopt-from /ruta/factory-historica --apply
```

La adopción exige que todos los archivos gestionados coincidan con esa plantilla,
renderizada con el AppSpec de la app. Sólo crea el manifiesto; no cambia código ni datos.
La versión se registra como `historical-adopted`, sin atribuirle una versión inventada.
Guardá en el commit de adopción el SHA de la Factory histórica usada.

Si hay diferencias, prepará y revisá un baseline fiable por separado. Esta primera
versión no automatiza esa reconciliación. Tampoco certifica la compatibilidad semántica
de una extensión sólo porque sus archivos no fueron sobrescritos.

## Propiedad y migraciones

- `src/platform/`: infraestructura común; nuevas extensiones van en `src/features/`.
- `src/lib/`, rutas y componentes compartidos, scripts y configuración base: sólo los
  archivos concretos registrados en el manifiesto son candidatos a actualización.
- `app-spec.json`, `src/generated/`, migraciones generadas, extensiones y secretos:
  fuera del actualizador de plataforma.
- Los siete SQL históricos 110–170 conservan `database/custom/` y sus identificadores
  en `app_migration`. Nuevos SQL de plataforma van en `database/platform/`.
- Orden: generated, siete SQL históricos de plataforma, platform, restantes custom.
  No se admite una dependencia que necesite invertir ese orden; planificá el cambio
  por fases. Las migraciones nuevas de plataforma deben soportar apps ya existentes.

No se borra ni reescribe SQL aplicado. Un archivo SQL nuevo sigue necesitando revisión,
backup de datos y una prueba real del runner. La detección de operaciones destructivas
es una guarda acotada para SQL revisado, no un sandbox para SQL arbitrario.

## Respaldo y recuperación

Antes de modificar archivos, `--apply` crea `.factory-backup-<id>/` con el contenido
anterior, el manifiesto anterior y `restore.json` (lista de archivos antes ausentes).
Usa `.factory-update.lock` para evitar actualizadores simultáneos y rechaza symlinks,
junctions y rutas que escapen de la app. No ejecutes otro editor o generador durante
la aplicación: el lock coordina actualizadores Factory, no todos los procesos del sistema.

Un error controlado restaura los archivos automáticamente. Un cierre abrupto del
proceso o del equipo puede dejar una aplicación parcial; el lock bloquea otra ejecución.
En ese caso:

1. Detené procesos que estén escribiendo en la aplicación.
2. Leé el lock y el `restore.json` del respaldo indicado.
3. Restaurá cada archivo respaldado en su ruta relativa original, incluido el manifiesto.
4. Retirá **solamente** los archivos listados en `previously_absent`, verificando que
   sus rutas permanezcan dentro de esa aplicación. No borres carpetas completas.
5. Compará con Git y el respaldo. Sólo después de verificar la recuperación, quitá el lock.

El respaldo no incluye PostgreSQL, Clerk ni secretos. Es local y queda excluido de Git;
la copia durable del código sigue siendo el repositorio. No hay un rollback de datos automático.

## Verificación posterior

Revisá el diff, instalá dependencias con lockfile congelado, ejecutá typecheck y build.
En PostgreSQL descartable, probá migraciones repetidas, permisos, MCP y extensiones.
Si se modifican permisos/migraciones, el fixture de seguridad debe pasar. Publicar y
verificar producción es una etapa separada regida por `deployment-vercel.md`.

Esta versión es un actualizador conservador de archivos, no un instalador universal
de plugins ni un sistema de migraciones sin revisión.
