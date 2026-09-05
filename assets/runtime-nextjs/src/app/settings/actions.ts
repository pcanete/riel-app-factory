"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteApplicationOption,
  setApplicationGeneralSettings,
  upsertApplicationOption,
} from "@/platform/settings/store";
import { recordAuditEvent } from "@/lib/audit";
import { requireSettingsAccess } from "@/lib/auth";
import { withTransaction } from "@/lib/db";

const OPTION_NAME = /^[a-z][a-z0-9_.-]{0,63}$/;
const RESERVED_OPTIONS = new Set(["general.locale", "general.timezone"]);
const MAX_OPTION_VALUE_BYTES = 64 * 1024;

function refreshSettings() {
  revalidatePath("/settings");
  revalidatePath("/audit");
}

function optionIdentity(formData: FormData) {
  const namespace = String(formData.get("namespace") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  if (!OPTION_NAME.test(namespace) || !OPTION_NAME.test(key)) {
    redirect("/settings?error=invalid_option_name");
  }
  return { namespace, key, identity: `${namespace}.${key}` };
}

function parseOptionValue(formData: FormData) {
  const valueType = String(formData.get("value_type") ?? "");
  const rawValue = String(formData.get("value") ?? "");
  if (Buffer.byteLength(rawValue, "utf8") > MAX_OPTION_VALUE_BYTES) {
    redirect("/settings?error=option_too_large");
  }
  if (valueType === "text") return { value: rawValue, valueType };
  if (valueType === "number") {
    if (!rawValue.trim()) redirect("/settings?error=invalid_option_value");
    const value = Number(rawValue);
    if (!Number.isFinite(value)) redirect("/settings?error=invalid_option_value");
    return { value, valueType };
  }
  if (valueType === "boolean") {
    if (rawValue !== "true" && rawValue !== "false") redirect("/settings?error=invalid_option_value");
    return { value: rawValue === "true", valueType };
  }
  if (valueType === "json") {
    try {
      return { value: JSON.parse(rawValue) as unknown, valueType };
    } catch {
      redirect("/settings?error=invalid_option_value");
    }
  }
  redirect("/settings?error=invalid_option_type");
}

export async function saveApplicationSettingsAction(formData: FormData) {
  const user = await requireSettingsAccess();
  const locale = String(formData.get("locale") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale) || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(timezone)) {
    redirect("/settings?error=invalid_application_settings");
  }
  await withTransaction(async (client) => {
    await setApplicationGeneralSettings(client, user.id, { locale, timezone });
    await recordAuditEvent(client, {
      actorId: user.id,
      entityKey: "app_setting",
      recordId: "general",
      action: "application_settings_update",
      changes: { locale, timezone },
    });
  });
  refreshSettings();
  redirect("/settings?saved=application");
}

export async function saveApplicationOptionAction(formData: FormData) {
  const user = await requireSettingsAccess();
  const option = optionIdentity(formData);
  if (RESERVED_OPTIONS.has(option.identity)) redirect("/settings?error=reserved_option");
  const parsed = parseOptionValue(formData);
  await withTransaction(async (client) => {
    await upsertApplicationOption(client, user.id, { namespace: option.namespace, key: option.key, value: parsed.value });
    await recordAuditEvent(client, {
      actorId: user.id,
      entityKey: "app_setting",
      recordId: option.identity,
      action: "application_option_update",
      changes: { namespace: option.namespace, key: option.key, valueType: parsed.valueType },
    });
  });
  refreshSettings();
  redirect("/settings?saved=option");
}

export async function deleteApplicationOptionAction(formData: FormData) {
  const user = await requireSettingsAccess();
  const option = optionIdentity(formData);
  if (RESERVED_OPTIONS.has(option.identity)) redirect("/settings?error=reserved_option");
  await withTransaction(async (client) => {
    await deleteApplicationOption(client, option.namespace, option.key);
    await recordAuditEvent(client, {
      actorId: user.id,
      entityKey: "app_setting",
      recordId: option.identity,
      action: "application_option_delete",
      changes: { namespace: option.namespace, key: option.key },
    });
  });
  refreshSettings();
  redirect("/settings?saved=option_removed");
}
