import { readFileSync } from "node:fs";

function pooled() {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";
}

function direct() {
  return (
    process.env.DATABASE_URL_DIRECT?.trim()
    || process.env.POSTGRES_URL_NON_POOLING?.trim()
    || pooled()
  );
}

function certificateAuthority() {
  const file = process.env.DATABASE_CA_CERT_FILE?.trim();
  if (file) return readFileSync(file, "utf8");

  const inline = process.env.DATABASE_CA_CERT?.trim();
  return inline ? inline.replaceAll("\\n", "\n") : "";
}

function databaseSsl() {
  const ca = certificateAuthority();
  if (ca) return { ca, rejectUnauthorized: true };
  const mode = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (mode === "off") return false;
  if (mode === "relaxed") return { rejectUnauthorized: false };
  return undefined;
}

function withoutSslMode(connectionString) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function databaseConfig({ direct: useDirect = false } = {}) {
  const raw = useDirect ? direct() : pooled();
  if (!raw) {
    throw new Error("Falta DATABASE_URL (o POSTGRES_URL provista por la integración).");
  }
  const ssl = databaseSsl();
  return ssl === undefined
    ? { connectionString: raw }
    : { connectionString: withoutSslMode(raw), ssl };
}
