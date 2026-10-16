export const ITEM_CATEGORIES = { SUPPLY: "Insumo", MATERIAL: "Material" } as const;
export type ItemCategory = keyof typeof ITEM_CATEGORIES;
export type InventoryItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  minimum: number;
  trackLots: boolean;
  active: boolean;
  category: ItemCategory;
  unitCost: number | null;
};

export const EQUIPMENT_KINDS = { BIOMEDICAL: "Biomédico", GENERAL: "General" } as const;
export type EquipmentKind = keyof typeof EQUIPMENT_KINDS;
export const EQUIPMENT_STATUS = {
  ACTIVE: "En uso",
  MAINTENANCE: "En mantenimiento",
  OUT_OF_SERVICE: "Fuera de servicio",
  RETIRED: "Dado de baja",
} as const;
export type EquipmentStatus = keyof typeof EQUIPMENT_STATUS;
/** Clasificación de riesgo de dispositivos médicos (Decreto 4725 de 2005). */
export const RISK_CLASSES = { I: "I", IIA: "IIa", IIB: "IIb", III: "III" } as const;
export type RiskClass = keyof typeof RISK_CLASSES;

export type Equipment = {
  id: string;
  site: { id: string; name: string };
  code: string;
  name: string;
  kind: EquipmentKind;
  brand: string | null;
  model: string | null;
  serial: string | null;
  invimaRegistry: string | null;
  riskClass: RiskClass | null;
  location: string | null;
  acquiredOn: string | null;
  cost: number | null;
  warrantyUntil: string | null;
  maintenanceMonths: number | null;
  status: EquipmentStatus;
  notes: string | null;
  lastMaintenance: string | null;
  nextMaintenance: string | null;
  updatedAt: string;
};
export type EquipmentInput = Omit<Equipment, "id" | "site" | "lastMaintenance" | "nextMaintenance" | "updatedAt"> & { siteId: string };
export type InventoryStock = { batchId: string; itemId: string; siteId: string; lot: string; expiresOn: string | null; quantity: number };
export const MOVEMENT_KINDS = { ENTRY: "Entrada", CONSUMPTION: "Consumo", DISCARD: "Baja / descarte", ADJUSTMENT: "Ajuste", TRANSFER: "Traslado" };
export type MovementKind = keyof typeof MOVEMENT_KINDS;
export type InventoryMovement = { id: string; operationId: string; itemId: string; siteId: string; lot: string; kind: string; delta: number; balance: number; reason: string; reference: string | null; createdBy: string; createdAt: string };
export type InventoryOverview = { items: InventoryItem[]; stock: InventoryStock[]; movements: InventoryMovement[] };
export type ItemInput = Omit<InventoryItem, "id">;
export type MovementInput = { operationId: string; itemId: string; siteId: string; kind: MovementKind; quantity: number; lot: string | null; expiresOn: string | null; destinationSiteId: string | null; reason: string; reference: string | null };
