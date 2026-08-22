import { readFileSync } from "node:fs";

export const MISSING_CONNECTION_MESSAGE =
  "Falta DATABASE_URL. Copiá .env.example a .env.local y configurá PostgreSQL.";

export function pooledConnectionString() {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";
}

export function directConnectionString() {
  return (
    process.env.DATABASE_URL_DIRECT?.trim()
    || process.env.POSTGRES_URL_NON_POOLING?.trim()
    || pooledConnectionString()
  );
}

function certificateAuthority() {
  const file = process.env.DATABASE_CA_CERT_FILE?.trim();
  if (file) return readFileSync(file, "utf8");

  const inline = process.env.DATABASE_CA_CERT?.trim();
  return inline ? inline.replaceAll("\\n", "\n") : "";
}

export function databaseSsl() {
  const ca = certificateAuthority();
  if (ca) return { ca, rejectUnauthorized: true };

  switch (process.env.DATABASE_SSL?.trim().toLowerCase()) {
    case "off":
      return false;
    case "relaxed":
      return { rejectUnauthorized: false };
    default:
      return undefined;
  }
}

function withoutSslMode(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function databaseConfig(options: { direct?: boolean } = {}) {
  const raw = options.direct ? directConnectionString() : pooledConnectionString();
  if (!raw) throw new Error(MISSING_CONNECTION_MESSAGE);
  const ssl = databaseSsl();
  return ssl === undefined
    ? { connectionString: raw }
    : { connectionString: withoutSslMode(raw), ssl };
}
