# Validación de la primera etapa de consolidación

Rama: `hardening/safe-platform-evolution`. Base previa: `aced5f1`.
Alcance: migraciones destructivas, recibos idempotentes MCP, separación de plataforma,
actualizador conservador, pruebas y documentación. Sin cambios en producción ni en el
repositorio de Claude. OAuth y la unificación de principales quedan para otra etapa.

## Resultados locales

| Verificación | Resultado |
| --- | --- |
| Compilador (`test_scaffold.py`) | 33 pruebas aprobadas |
| Evolución (`test_evolve_app.py`) | 13 pruebas aprobadas |
| Actualizador (`test_platform.py`) | 15 pruebas aprobadas |
| Política pura de acceso por registro | Aprobada |
| Guarda pura de migraciones | Aprobada, incluidos nombres citados/no citados |
| Fixture de seguridad en PostgreSQL 17.11 | Aprobado |
| Runner de migraciones en PostgreSQL 17.11 | Aprobado |
| Typecheck y build de fixture nuevo | Aprobados, Next.js 16.3.1 |
| Adopción y actualización de app de la Factory previa | Aprobadas |
| Typecheck y build de app actualizada | Aprobados |
| CRUD real de tres entidades de app actualizada | Aprobado, datos de smoke revertidos |
| Registro y migración propios del cliente preexistentes | Conservados; migración histórica omitida por checksum |
| Extensión con import de la ruta histórica de settings | Conservada y compilada mediante puente de compatibilidad |
| Verificador de scaffold | Ambas apps verificadas, 94 archivos obligatorios |
| Validador del skill y sintaxis del workflow YAML | Aprobados |

Se instalaron dependencias desde el lockfile congelado. Entorno local: Windows,
Node.js 24.14.0, pnpm 11.19.0 y Python 3; CI declara Node 24, Python 3.12 y pnpm 10.
El workflow agrega un job PostgreSQL de seguridad; no se afirma que haya corrido
en GitHub hasta publicar la rama y observar ese run.

## Qué probaron los casos de seguridad

Usuarios A/B separados en lecturas, listas, conteos, exportación, calendario y opciones
de relaciones. Denegación de relación fuera de alcance, asignación a otra persona,
transferencia de dueño y mutación ajena. Un agente con rol alto no supera las acciones
autorizadas a su responsable. Desactivar al responsable invalida la autenticación.

Se simuló un resultado idempotente antiguo que contenía el registro completo, se
reasignó el agente y se repitió el pedido: sólo se devolvió el recibo. La escritura no
volvió a ejecutarse. Dos reintentos paralelos ejecutaron una sola escritura; cambiar
el pedido con la misma clave fue rechazado.

El runner rechazó una segunda instancia y un TRUNCATE CASCADE sobre padre vacío con
hija poblada; conservó las filas y no anotó la migración rechazada. DROP sin COLUMN,
incluidos identificadores no citados en mayúsculas, se bloqueó con valores existentes.
Sólo la autorización exacta permitió aplicarlo. Una tabla vacía se eliminó sin excepción.

## Revisión independiente y límites

Una revisión independiente reprodujo y ayudó a corregir dos defectos del actualizador
nuevo: abreviación de `--apply` en el comando de consulta y normalización indebida de
binarios. Ambos tienen regresiones y la segunda revisión confirmó los fixes.

El primer intento de build de la app antigua reutilizaba dependencias mediante una
junction; Turbopack lo rechazó por salir de la raíz. Se retiró sólo ese enlace, se
instalaron dependencias propias y el build pasó. No se cambió la configuración del
producto para esconder esa limitación del entorno de prueba.

No se ejecutó QA visual, login Clerk real, OAuth, cliente MCP extremo a extremo, carga
ni despliegue Vercel en esta etapa. Las pruebas del repositorio y de mutaciones usan
las funciones reales contra PostgreSQL, no sustituyen toda la ruta HTTP o de interfaz.
La guarda SQL es acotada y el actualizador no garantiza compatibilidad semántica de
todas las extensiones ni rollback de base de datos. Las aplicaciones anteriores con
personalizaciones divergentes requieren reconciliar un baseline fiable manualmente.

Antes de llevarlo a Mesa: publicar una rama revisable, observar CI remoto, ensayar en
una copia con su AppSpec y extensiones reales y recién entonces autorizar despliegue.
