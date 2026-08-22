const IDENTIFIER = /^[a-z_][a-z0-9_$]*$/i;

export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function cleanObject(value) {
  return value.replace(/\b(cascade|restrict)\b/gi, "").replace(/"/g, "").trim();
}

function splitName(value) {
  const parts = value.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1 && IDENTIFIER.test(parts[0])) return { schema: "public", table: parts[0] };
  if (parts.length === 2 && parts.every((part) => IDENTIFIER.test(part))) return { schema: parts[0], table: parts[1] };
  return null;
}

export function destructiveOperations(source) {
  const sql = stripComments(source);
  const found = [];
  for (const match of sql.matchAll(/\bdrop\s+table\s+(?:if\s+exists\s+)?([^;]+)/gi)) {
    for (const value of match[1].split(",")) {
      const object = cleanObject(value);
      if (object) found.push({ operation: "DROP TABLE", object });
    }
  }
  for (const match of sql.matchAll(/\btruncate\s+(?:table\s+)?([^;]+)/gi)) {
    for (const value of match[1].split(",")) {
      const object = cleanObject(value);
      if (object) found.push({ operation: "TRUNCATE", object });
    }
  }
  for (const match of sql.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?([^\s;]+)([\s\S]*?)(?=;|$)/gi)) {
    const object = cleanObject(match[1]);
    for (const column of match[2].matchAll(/\bdrop\s+column\s+(?:if\s+exists\s+)?([^\s,;]+)/gi)) {
      found.push({ operation: "DROP COLUMN", object, column: cleanObject(column[1]) });
    }
  }
  for (const match of sql.matchAll(/\bdelete\s+from\s+([^\s;]+)([^;]*)/gi)) {
    if (!/\bwhere\b/i.test(match[2])) found.push({ operation: "DELETE sin WHERE", object: cleanObject(match[1]) });
  }
  for (const match of sql.matchAll(/\bdrop\s+(schema|database)\s+(?:if\s+exists\s+)?([^\s;]+)/gi)) {
    found.push({ operation: `DROP ${match[1].toUpperCase()}`, object: cleanObject(match[2]), alwaysCritical: true });
  }
  return found;
}

export async function operationsWithData(client, operations) {
  const critical = [];
  for (const operation of operations) {
    if (operation.alwaysCritical) {
      critical.push({ ...operation, reason: "alcanza objetos que no se pueden inspeccionar individualmente" });
      continue;
    }
    const target = splitName(operation.object);
    if (!target) {
      critical.push({ ...operation, reason: "no se pudo interpretar el nombre del objeto" });
      continue;
    }
    try {
      const exists = await client.query("SELECT to_regclass($1) AS oid", [`${target.schema}.${target.table}`]);
      if (!exists.rows[0]?.oid) continue;
      if (operation.column) {
        if (!IDENTIFIER.test(operation.column)) {
          critical.push({ ...operation, reason: "no se pudo interpretar el nombre de la columna" });
          continue;
        }
        const column = await client.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3",
          [target.schema, target.table, operation.column],
        );
        if (!column.rowCount) continue;
        const values = await client.query(`SELECT EXISTS (SELECT 1 FROM "${target.schema}"."${target.table}" WHERE "${operation.column}" IS NOT NULL LIMIT 1) AS present`);
        if (values.rows[0]?.present) critical.push({ ...operation, reason: "la columna contiene valores" });
        continue;
      }
      const rows = await client.query(`SELECT EXISTS (SELECT 1 FROM "${target.schema}"."${target.table}" LIMIT 1) AS present`);
      if (rows.rows[0]?.present) critical.push({ ...operation, reason: "la tabla contiene filas" });
    } catch (error) {
      critical.push({ ...operation, reason: `no se pudo verificar: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return critical;
}

export function allowedDestructiveMigrations(environment = process.env) {
  return new Set(String(environment.ALLOW_DESTRUCTIVE_MIGRATIONS ?? "").split(",").map((name) => name.trim()).filter(Boolean));
}

export function blockedMigrationMessage(name, operations) {
  const details = operations.map((item) => `  - ${item.operation} sobre ${item.object}${item.column ? `.${item.column}` : ""}: ${item.reason}`).join("\n");
  return [`La migración ${name} destruiría datos existentes:`, details, "", "No se aplicó durante el despliegue.", "1. Creá un respaldo y verificá su restauración.", "2. Revisá y ejecutá la operación como un cambio separado.", "", `Autorización explícita de una sola migración: ALLOW_DESTRUCTIVE_MIGRATIONS=\"${name}\"`].join("\n");
}
