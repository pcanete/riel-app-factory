import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { databaseConfig } from "./db-connection.mjs";
import { allowedDestructiveMigrations, blockedMigrationMessage, destructiveOperations, operationsWithData } from "./destructive-guard.mjs";

const { Client } = pg;
const legacyPlatform = new Set([
  "110_user_management.sql", "120_clerk_authentication.sql", "130_application_settings.sql",
  "140_mcp_agents.sql", "150_mcp_write.sql", "160_setting_agent_actor.sql", "170_agent_accountability.sql",
]);

const migrationDirectories = [
  { key: "generated", directory: resolve("database/generated") },
  { key: "platform", directory: resolve("database/platform") },
  { key: "custom", directory: resolve("database/custom") },
];
const migrations = (
  await Promise.all(
    migrationDirectories.map(async ({ key, directory }) =>
      (await readdir(directory).catch((error) => {
        if (key === "platform" && error.code === "ENOENT") return [];
        throw error;
      }))
        .filter((file) => file.endsWith(".sql"))
        .sort()
        .map((file) => ({
          key,
          directory,
          file,
          name: key === "generated" ? file : `${key}/${file}`,
        })),
    ),
  )
).flat().sort((left, right) => {
  const rank = (migration) => migration.key === "generated" ? 0
    : migration.key === "custom" && legacyPlatform.has(migration.file) ? 1
      : migration.key === "platform" ? 2 : 3;
  return rank(left) - rank(right) || left.file.localeCompare(right.file);
});
const client = new Client(databaseConfig({ direct: true }));
await client.connect();

try {
  const lock = await client.query("SELECT pg_try_advisory_lock(170017, 1) AS acquired");
  if (!lock.rows[0]?.acquired) throw new Error("Otra instancia está aplicando migraciones. Reintentá cuando termine.");
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_migration (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const allowed = allowedDestructiveMigrations();

  for (const migration of migrations) {
    const { file, name, directory } = migration;
    const source = await readFile(resolve(directory, file), "utf8");
    // Git, Windows and deployment APIs can represent the same SQL with
    // different line endings. Normalize them so the integrity check detects
    // real migration edits instead of transport-only CRLF/LF differences.
    const checksumSource = source.replace(/\r\n?/g, "\n");
    const checksum = createHash("sha256").update(checksumSource).digest("hex");
    const existing = await client.query("SELECT checksum FROM app_migration WHERE name = $1", [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`La migración aplicada ${name} fue modificada.`);
      }
      console.log(`skip ${name}`);
      continue;
    }
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '120s'");
      const destructive = destructiveOperations(source);
      if (destructive.length && !allowed.has(name)) {
        const critical = await operationsWithData(client, destructive, { lockTargets: true });
        if (critical.length) throw new Error(blockedMigrationMessage(name, critical));
      }
      await client.query(source);
      await client.query("INSERT INTO app_migration (name, checksum) VALUES ($1, $2)", [name, checksum]);
      await client.query("COMMIT");
      console.log(`apply ${name}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(170017, 1)").catch(() => undefined);
  await client.end();
}
