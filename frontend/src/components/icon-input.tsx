"use client";
import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, Phone, MapPin, Building2, UserRound, FileText, DollarSign, Barcode, Tags, CalendarDays, BriefcaseBusiness } from "lucide-react";
import { Input } from "@/components/ui/input";
const icons = { name: UserRound, fullName: UserRound, firstName: UserRound, middleName: UserRound, firstLastName: UserRound, secondLastName: UserRound, email: Mail, phone: Phone, address: MapPin, city: Building2, municipality: Building2, guardianName: UserRound, guardianPhone: Phone, price: DollarSign, cupsCode: Barcode, code: Tags, birthDate: CalendarDays, occupation: BriefcaseBusiness, documentNumber: FileText };
export function IconInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  const password = props.type === "password";
  const Icon = password ? LockKeyhole : icons[props.name as keyof typeof icons] ?? FileText;
  return <div className="reference-input relative"><Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input {...props} type={password && visible ? "text" : props.type} className={`pl-10 ${password ? "pr-11" : ""} ${props.className ?? ""}`} />{password && <button type="button" aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible} onClick={() => setVisible(!visible)} className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>}</div>;
}
