import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, PenLine, Pill } from "lucide-react";
import { api,getMe } from "@/lib/api";
import { canReadClinical,canWriteClinical,type Page } from "@/lib/types";
import type { Prescription } from "@/lib/documents";
import { formatDateTime } from "@/lib/format";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { PrescriptionForm } from "./prescription-form";
export const metadata={title:"Fórmulas médicas"};
export default async function PrescriptionsPage({params,searchParams}:PageProps<"/app/pacientes/[id]/formulas">){const {id}=await params;const me=await getMe();if(!canReadClinical(me))redirect(`/app/pacientes/${id}`);const sp=await searchParams;const page=Math.min(1000000,Math.max(0,Math.trunc(Number(sp.page)||0)));const result=await api<Page<Prescription>>(`/api/patients/${id}/prescriptions?page=${page}`);return <div className="grid gap-6"><header><h2 className="flex items-center gap-3 text-2xl font-semibold"><Pill className="text-primary"/>Fórmulas médicas e indicaciones</h2><p className="mt-2 text-muted-foreground">Documentos del profesional, con el logo de tu clínica y firma conservada al emitirlos.</p></header><div className="grid gap-3">{result.content.map(p=><Link key={p.id} href={`/app/pacientes/${id}/formulas/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5"><div className="flex items-center gap-3">{p.signedAt?<FileText className="text-primary"/>:<PenLine className="text-primary"/>}<div><p className="font-medium">{p.signedAt?"Fórmula emitida":"Borrador de fórmula"}</p><p className="text-xs text-muted-foreground">{p.snapshot?.professional??p.author} · {formatDateTime(p.signedAt??p.createdAt)}</p></div></div><Badge variant={p.signedAt?"secondary":"outline"}>{p.signedAt?"Firmada":"Pendiente de firma"}</Badge></Link>)}</div>{!result.content.length&&<p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Aún no hay fórmulas médicas para este paciente.</p>}<PaginationLinks page={result.page} pages={result.totalPages} total={result.totalElements} href={p=>`/app/pacientes/${id}/formulas?page=${p}`}/>{canWriteClinical(me)&&<PrescriptionForm patientId={id}/>}</div>;}
