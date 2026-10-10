export const MODULE_COLORS: Record<
  string,
  { color: string; background: string }
> = {
  patients: {
    color: "var(--module-patients)",
    background: "var(--module-patients-bg)",
  },
  agenda: {
    color: "var(--module-agenda)",
    background: "var(--module-agenda-bg)",
  },
  CLINICAL_RECORD: {
    color: "var(--module-clinical)",
    background: "var(--module-clinical-bg)",
  },
  TREATMENTS_CASH: {
    color: "var(--module-cash)",
    background: "var(--module-cash-bg)",
  },
  BILLING_RIPS: {
    color: "var(--module-billing)",
    background: "var(--module-billing-bg)",
  },
  INVENTORY: {
    color: "var(--module-inventory)",
    background: "var(--module-inventory-bg)",
  },
  REPORTS: {
    color: "var(--module-reports)",
    background: "var(--module-reports-bg)",
  },
  MESSAGING: {
    color: "var(--module-messaging)",
    background: "var(--module-messaging-bg)",
  },
};
export const ROUTE_MODULES: Record<string, string> = {
  pacientes: "patients",
  agenda: "agenda",
  historias: "CLINICAL_RECORD",
  caja: "TREATMENTS_CASH",
  precios: "TREATMENTS_CASH",
  facturacion: "BILLING_RIPS",
  inventario: "INVENTORY",
  reportes: "REPORTS",
  mensajes: "MESSAGING",
};
