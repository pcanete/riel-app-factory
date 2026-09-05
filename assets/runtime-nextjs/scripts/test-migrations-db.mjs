import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";
import { databaseConfig } from "./db-connection.mjs";

assert.equal(process.env.FACTORY_TEST_DATABASE, "1", "Sólo usar con una base descartable y FACTORY_TEST_DATABASE=1");
const client = new pg.Client(databaseConfig({ direct: true }));
await client.connect();
const prefix = `guard_test_${randomBytes(6).toString("hex")}`;
const files = [];
const tables = ["parent", "child", "populated", "empty"].map(suffix => `${prefix}_${suffix}`);
const [parent, child, populated, empty] = tables;
const runner = (allow = "") => new Promise((done, reject) => {
  const processHandle = spawn(process.execPath, ["scripts/apply-migrations.mjs"], {
    cwd: process.cwd(), env: { ...process.env, ALLOW_DESTRUCTIVE_MIGRATIONS: allow },
    windowsHide: true, timeout: 25000,
  });
  let output = "";
  processHandle.stdout.on("data", chunk => { output += chunk; });
  processHandle.stderr.on("data", chunk => { output += chunk; });
  processHandle.on("error", reject);
  processHandle.on("close", code => done({ code, output }));
});
async function migration(suffix, source) {
  const name = `custom/999_${prefix}_${suffix}.sql`;
  const path = resolve("database", name);
  await writeFile(path, source, { flag: "wx" });
  files.push({ name, path });
  return name;
}
try {
  await client.query(`CREATE TABLE "${parent}" (id integer PRIMARY KEY)`);
  await client.query(`CREATE TABLE "${child}" (id integer PRIMARY KEY, parent_id integer REFERENCES "${parent}"(id))`);
  await client.query(`INSERT INTO "${child}" VALUES (1,NULL)`);
  await client.query(`CREATE TABLE "${populated}" (value text)`);
  await client.query(`INSERT INTO "${populated}" VALUES ('must survive')`);
  await client.query(`CREATE TABLE "${empty}" (value text)`);

  await client.query("SELECT pg_advisory_lock(170017,1)");
  const busy = await runner();
  assert.notEqual(busy.code, 0);
  assert.match(busy.output, /Otra instancia/);
  await client.query("SELECT pg_advisory_unlock(170017,1)");

  const cascade = await migration("01_cascade", `TRUNCATE "${parent}" CASCADE;`);
  let result = await runner();
  assert.notEqual(result.code, 0);
  assert.match(result.output, /destruiría datos/);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${child}"`)).rows[0].n, 1);
  assert.equal((await client.query("SELECT 1 FROM app_migration WHERE name=$1", [cascade])).rowCount, 0);
  result = await runner(cascade);
  assert.equal(result.code, 0, result.output);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${child}"`)).rows[0].n, 0);

  const drop = await migration("02_column", `ALTER TABLE ${populated.toUpperCase()} DROP VALUE;`);
  result = await runner("*");
  assert.notEqual(result.code, 0, "No existe autorización comodín");
  assert.match(result.output, /destruiría datos/);
  assert.equal((await client.query(`SELECT value FROM "${populated}"`)).rows[0].value, "must survive");
  result = await runner(drop);
  assert.equal(result.code, 0, result.output);

  await migration("03_empty", `DROP TABLE "${empty}";`);
  result = await runner();
  assert.equal(result.code, 0, result.output);
  assert.equal((await client.query("SELECT to_regclass($1) AS relation", [empty])).rows[0].relation, null);
  result = await runner();
  assert.equal(result.code, 0, result.output);
  console.log("Migration DB passed: exclusive runner, CASCADE with populated child, DROP without COLUMN, exact authorization, rollback and repeat execution.");
} finally {
  await client.query("SELECT pg_advisory_unlock(170017,1)");
  // Only random fixture objects created above; never application entities.
  for (const table of [child, parent, populated, empty]) await client.query(`DROP TABLE IF EXISTS "${table}"`);
  for (const file of files) {
    await unlink(file.path);
    await client.query("DELETE FROM app_migration WHERE name=$1", [file.name]);
  }
  await client.end();
}
