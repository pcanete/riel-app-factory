import type { EntitySpec, FieldSpec } from "@/lib/spec";

export function formatValue(value: unknown, locale = "es-AR") {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (value instanceof Date) return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formatDateTimeValue(value: unknown, locale = "es-AR") {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.valueOf())
    ? formatValue(value, locale)
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatFieldValue(field: FieldSpec, value: unknown, locale = "es-AR") {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "tags") {
    const tags = Array.isArray(value) ? value.map(String) : [];
    if (!tags.length) return "—";
    const labels = new Map((field.options ?? []).map((option) => [option.key, option.label]));
    return tags.map((tag) => labels.get(tag) ?? tag).join(", ");
  }
  if (field.type === "enum") {
    return field.options?.find((option) => option.key === String(value))?.label ?? String(value);
  }
  if (field.type === "date") {
    const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(date.valueOf())
      ? String(value)
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
  }
  if (field.type === "datetime") {
    return formatDateTimeValue(value, locale);
  }
  if (field.type === "integer" || field.type === "decimal") {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat(locale).format(number) : String(value);
  }
  return formatValue(value, locale);
}

export function recordsForClient(records: Array<Record<string, unknown>>) {
  return records.map((record) => Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  ));
}

export function recordsWithUserReferenceLabels(
  entity: EntitySpec,
  records: Array<Record<string, unknown>>,
  options: Record<string, Array<{ id: string; label: string }>>,
) {
  const fields = entity.fields.filter((field) => field.type === "user_reference");
  if (!fields.length) return records;
  const labels = Object.fromEntries(fields.map((field) => [
    field.key,
    new Map((options[field.key] ?? []).map((option) => [option.id, option.label])),
  ])) as Record<string, Map<string, string>>;
  return records.map((record) => ({
    ...record,
    ...Object.fromEntries(fields.map((field) => {
      const value = record[field.key];
      return [field.key, typeof value === "string" ? labels[field.key].get(value) ?? value : value];
    })),
  }));
}
