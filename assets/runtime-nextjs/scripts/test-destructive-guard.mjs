import { allowedDestructiveMigrations, blockedMigrationMessage, destructiveOperations, operationsWithData } from "./destructive-guard.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(destructiveOperations("-- DROP TABLE ignored\nALTER TABLE item ADD COLUMN note text;").length === 0, "comments and additive SQL must be ignored");
assert(destructiveOperations("ALTER TABLE item DROP COLUMN a, DROP COLUMN IF EXISTS b;").length === 2, "all dropped columns must be detected");
assert(destructiveOperations("DELETE FROM item WHERE id = 1;").length === 0, "bounded DELETE must be accepted");
assert(destructiveOperations("DELETE FROM item; TRUNCATE other; DROP SCHEMA public CASCADE;").length === 3, "unbounded destructive operations must be detected");

function fakeClient({ exists = true, rows = false, column = true, values = false } = {}) {
  return { async query(source) {
    if (source.includes("to_regclass")) return { rows: [{ oid: exists ? 1 : null }] };
    if (source.includes("information_schema.columns")) return { rowCount: column ? 1 : 0 };
    return { rows: [{ present: source.includes("IS NOT NULL") ? values : rows }] };
  } };
}

const drop = destructiveOperations("DROP TABLE item;");
assert((await operationsWithData(fakeClient({ exists: false }), drop)).length === 0, "missing tables must not block");
assert((await operationsWithData(fakeClient({ rows: false }), drop)).length === 0, "empty tables must not block");
assert((await operationsWithData(fakeClient({ rows: true }), drop)).length === 1, "tables with rows must block");
assert((await operationsWithData({ async query() { throw new Error("offline"); } }, drop)).length === 1, "inspection failures must fail closed");
assert(allowedDestructiveMigrations({ ALLOW_DESTRUCTIVE_MIGRATIONS: "custom/200_cleanup.sql" }).has("custom/200_cleanup.sql"), "authorization must be migration-specific");
assert(blockedMigrationMessage("custom/200_cleanup.sql", [{ operation: "DROP TABLE", object: "item", reason: "la tabla contiene filas" }]).includes("respaldo"), "blocking message must explain recovery");

console.log("Guarda de migraciones destructivas verificada.");
