# Migraciones de plataforma

Las migraciones nuevas de infraestructura compartida pertenecen aquí. Las migraciones
históricas 110–170 de Factory conservan sus rutas e identificadores en database/custom
por compatibilidad con aplicaciones existentes. El manifiesto las identifica por archivo;
esto no concede a Factory propiedad sobre otras migraciones de database/custom.

El runner ejecuta generated, las siete migraciones históricas de plataforma,
platform y las demás migraciones custom, en ese orden. Conservá las migraciones
históricas inmutables y probá bases nuevas y ya actualizadas en PostgreSQL.
