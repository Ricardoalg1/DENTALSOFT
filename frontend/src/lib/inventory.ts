export type InventoryItem = { id: string; code: string; name: string; unit: string; minimum: number; trackLots: boolean; active: boolean };
export type InventoryStock = { batchId: string; itemId: string; siteId: string; lot: string; expiresOn: string | null; quantity: number };
export const MOVEMENT_KINDS = { ENTRY: "Entrada", CONSUMPTION: "Consumo", DISCARD: "Baja / descarte", ADJUSTMENT: "Ajuste", TRANSFER: "Traslado" };
export type MovementKind = keyof typeof MOVEMENT_KINDS;
export type InventoryMovement = { id: string; operationId: string; itemId: string; siteId: string; lot: string; kind: string; delta: number; balance: number; reason: string; reference: string | null; createdBy: string; createdAt: string };
export type InventoryOverview = { items: InventoryItem[]; stock: InventoryStock[]; movements: InventoryMovement[] };
export type ItemInput = Omit<InventoryItem, "id">;
export type MovementInput = { operationId: string; itemId: string; siteId: string; kind: MovementKind; quantity: number; lot: string | null; expiresOn: string | null; destinationSiteId: string | null; reason: string; reference: string | null };
