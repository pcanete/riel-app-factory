import { revalidatePath } from "next/cache";

// A view can depend on any entity, so every write invalidates the shared view
// route whether it originated in the human interface or through MCP.
export function revalidateAfterWrite(entityKey: string, recordId?: string) {
  revalidatePath("/");
  revalidatePath("/views/[view]", "page");
  revalidatePath(`/records/${entityKey}`);
  if (recordId) revalidatePath(`/records/${entityKey}/${recordId}`);
  revalidatePath("/audit");
}
