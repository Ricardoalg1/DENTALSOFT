"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { api, ApiError, getMe } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { Equipment, EquipmentInput, ItemInput, MovementInput } from "@/lib/inventory";

type Result = { ok: true } | { ok: false; error: string };
export async function saveInventoryItem(id: string | null, input: ItemInput): Promise<Result> {
  try {
    const me = await getMe();
    if (me.role !== "ADMIN") throw new ApiError(403, "Solo administradores pueden gestionar insumos");
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "Insumo inválido");
    await api(id ? `/api/inventory/items/${id}` : "/api/inventory/items", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
    revalidatePath("/app/inventario");
    return { ok: true };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}
export async function registerInventoryMovement(input: MovementInput): Promise<Result> {
  try {
    const me = await getMe();
    if (!["ADMIN", "ASSISTANT"].includes(me.role)) throw new ApiError(403, "Solo administradores y auxiliares pueden registrar movimientos");
    await api("/api/inventory/movements", { method: "POST", body: JSON.stringify(input) });
    revalidatePath("/app/inventario");
    return { ok: true };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}

export async function saveEquipment(id: string | null, input: EquipmentInput): Promise<Result> {
  try {
    const me = await getMe();
    if (me.role !== "ADMIN") throw new ApiError(403, "Solo administradores pueden gestionar equipos");
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "Equipo inválido");
    await api(id ? `/api/equipment/${id}` : "/api/equipment", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
    revalidatePath("/app/inventario");
    return { ok: true };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}

/** Todos los equipos (incluidos los dados de baja) para descargar. */
export async function exportEquipment(): Promise<{ ok: true; data: Equipment[] } | { ok: false; error: string }> {
  try {
    const page = await api<{ content: Equipment[] }>("/api/equipment?includeRetired=true&size=100");
    return { ok: true, data: page.content };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}
