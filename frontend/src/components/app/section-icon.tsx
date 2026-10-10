import { CalendarDays, Clock3, Wallet, FileText, Link, Landmark, Plus, List, Package, KeyRound, LockKeyhole, Crown, Settings2, Hourglass, CreditCard, ChartColumn, UsersRound, MessageSquare, type LucideIcon } from "lucide-react";
const ICONS: Record<string, [LucideIcon, string]> = {
  "Citas de hoy": [CalendarDays, "blue"], "Tus citas de hoy": [CalendarDays, "blue"],
  "Abrir caja": [Wallet, "orange"], "Turnos abiertos": [Clock3, "blue"], "Turnos recientes": [CalendarDays, "green"],
  "Conexión Dataico": [Link, "teal"], "Documentos internos": [FileText, "purple"], "Datos fiscales y del prestador": [Landmark, "teal"],
  "Nuevo procedimiento": [Plus, "teal"], "Empieza con una lista de ejemplo": [List, "blue"],
  "Registrar movimiento": [Package, "orange"], "Nuevo insumo": [Plus, "teal"],
  "Cambiar contraseña": [KeyRound, "teal"], "Sesiones abiertas": [LockKeyhole, "blue"],
  "Proceso de suscripciones": [Settings2, "teal"], "Pruebas por terminar": [Hourglass, "purple"], "Pagos pendientes": [CreditCard, "orange"], "Renovaciones próximas": [CalendarDays, "blue"],
  "Nueva sede": [Landmark, "teal"], "Nuevo usuario": [UsersRound, "blue"], "Configuración de la clínica": [Settings2, "teal"], "Simular respuesta de un paciente": [MessageSquare, "teal"],
};
export function SectionIcon({ title }: { title: string }) {
  const entry = ICONS[title] ?? (title.startsWith("Plan ") ? [Crown, "blue"] as const : title.startsWith("Existencias") ? [Package, "teal"] as const : title.startsWith("Recaudo") || title.startsWith("Producción") ? [ChartColumn, "blue"] as const : null);
  if (!entry) return null;
  const [Icon, color] = entry;
  return <span className={`reference-icon reference-icon-${color}`}><Icon aria-hidden="true" /></span>;
}
