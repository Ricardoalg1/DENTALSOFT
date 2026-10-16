/** Centro de informes: secciones y sus informes (key = endpoint /api/reports/tables/{key}). */
export type ReportEntry = {
  key: string;
  label: string;
  description: string;
  /** Usa rango de fechas (si no, es el estado a hoy). */
  dates: boolean;
  /** Admite filtro por sede. */
  site?: boolean;
  /** Aún no disponible: necesita datos que el sistema no registra. */
  soon?: string;
};

export const REPORT_SECTIONS: { title: string; reports: ReportEntry[] }[] = [
  {
    title: "Financieros",
    reports: [
      { key: "ingresos", label: "Ingresos", description: "Recibos y abonos por fecha, tipo, sede, doctor y medio de pago.", dates: true, site: true },
      { key: "gastos", label: "Gastos", description: "Egresos por categoría, proveedor y sede.", dates: true, site: true },
      { key: "cuadre-caja", label: "Cuadre de caja", description: "Turnos: base, efectivo, gastos de caja, esperado, contado y diferencia.", dates: true, site: true },
      { key: "cartera", label: "Cartera", description: "Pacientes que deben y cuotas vencidas de financiamientos.", dates: false },
      { key: "anulaciones", label: "Anulaciones", description: "Ingresos y gastos anulados con motivo y responsable.", dates: true },
      { key: "presupuestos-pendientes", label: "Presupuestos pendientes", description: "Presupuestos sin aceptar o con procedimientos por realizar.", dates: true },
    ],
  },
  {
    title: "Operativos",
    reports: [
      { key: "citas", label: "Citas", description: "Citas por estado, profesional y sede.", dates: true, site: true },
      { key: "archivo-gestion", label: "Archivo de gestión", description: "Historias con atención en los últimos 5 años (Res. 839 de 2017).", dates: false },
      { key: "archivo-historico", label: "Archivo histórico", description: "Historias sin atención hace más de 5 años.", dates: false },
      { key: "cumpleanos", label: "Cumpleaños", description: "Pacientes que cumplen años en el periodo.", dates: true },
      { key: "residuos", label: "Residuos", description: "Residuos generados por tipo y peso (RH1).", dates: true, site: true },
    ],
  },
  {
    title: "Inventarios",
    reports: [
      { key: "inventarios", label: "Inventarios", description: "Existencias por insumo, sede y lote, con vencimientos y mínimos.", dates: false, site: true },
      { key: "movimientos-inventario", label: "Movimientos de inventario", description: "Entradas, consumos, descartes, ajustes y traslados.", dates: true, site: true },
      {
        key: "inventario-valorizado",
        label: "Inventario valorizado",
        description: "Existencias multiplicadas por su costo.",
        dates: false,
        soon: "Requiere registrar el costo de cada insumo en Inventario.",
      },
    ],
  },
  {
    title: "IPS",
    reports: [
      { key: "actividades", label: "Actividades", description: "Procedimientos realizados por código CUPS, cantidad y valor.", dates: true },
      { key: "oportunidad-citas", label: "Oportunidad de citas", description: "Días entre la solicitud y la cita asignada, por profesional.", dates: true, site: true },
      { key: "cop", label: "COP por persona", description: "Índice de cariados, obturados y perdidos desde el odontograma.", dates: false },
      {
        key: "resolucion-3280",
        label: "Resolución 3280",
        description: "Cumplimiento de las RIAS de salud bucal por curso de vida.",
        dates: true,
        soon: "Requiere mapear las actividades de la RIAS a sus códigos CUPS por curso de vida.",
      },
      {
        key: "suficiencia-upc",
        label: "Suficiencia UPC",
        description: "Frecuencias de uso y valor por afiliado para la EPS.",
        dates: true,
        soon: "Requiere los datos de afiliados y contratos por EPS.",
      },
      { key: "fev-rips", label: "FEV RIPS", description: "Facturas electrónicas de venta y estado de sus RIPS.", dates: true },
    ],
  },
];

export const reportByKey = (key: string) => REPORT_SECTIONS.flatMap((s) => s.reports).find((r) => r.key === key);

export type TableReport = {
  key: string;
  title: string;
  description: string;
  columns: { key: string; label: string; type: "TEXT" | "NUMBER" | "MONEY" | "DATE" | "DATETIME" }[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, number>;
  truncated: boolean;
};
