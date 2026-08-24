import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getAttachmentContent, getAttachmentMetadata } from "@/lib/attachments";
import { recordAccessForUser } from "@/lib/record-access";
import { getRecord } from "@/lib/repository";

export const dynamic = "force-dynamic";

function fallbackFileName(value: string) {
  const fallback = value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return fallback || "archivo";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, metadata] = await Promise.all([getCurrentUser(), getAttachmentMetadata(id)]);
  if (!metadata) return new Response("Archivo no encontrado", { status: 404 });
  if (!user) return new Response("Autenticación requerida", { status: 401 });
  if (!hasPermission(user, metadata.entity_key, "read")) return new Response("Archivo no encontrado", { status: 404 });
  const record = await getRecord(metadata.entity_key, metadata.record_id, undefined, false, recordAccessForUser(user));
  if (!record) return new Response("Archivo no encontrado", { status: 404 });
  const attachment = await getAttachmentContent(id);
  if (!attachment) return new Response("Archivo no encontrado", { status: 404 });

  const encodedName = encodeURIComponent(attachment.original_name);
  return new Response(new Uint8Array(attachment.content), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${fallbackFileName(attachment.original_name)}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(attachment.size_bytes),
      "Content-Type": attachment.content_type,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
