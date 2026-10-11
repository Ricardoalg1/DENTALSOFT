"use server";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import type { Medicine, Prescription } from "@/lib/documents";
export async function savePrescription(patient: string, id: string | null, body: {operationId: string; medicines: Medicine[]; recommendations: string; diagnosis: string}) {
 try {const data = await api<Prescription>(id?`/api/prescriptions/${encodeURIComponent(id)}`:`/api/patients/${encodeURIComponent(patient)}/prescriptions`,{method:id?"PUT":"POST",body:JSON.stringify(body)});revalidatePath(`/app/pacientes/${patient}/formulas`);return {ok:true as const,data};}catch(e){if(e instanceof ApiError)return {ok:false as const,error:e.message};throw e;}
}
export async function signPrescription(patient: string,id:string) {try {const data=await api<Prescription>(`/api/prescriptions/${encodeURIComponent(id)}/sign`,{method:"POST",body:JSON.stringify({confirmed:true})});if(data.patientId!==patient)throw new Error("Paciente de fórmula inválido");revalidatePath(`/app/pacientes/${patient}/formulas`);return {ok:true as const,data};}catch(e){if(e instanceof ApiError)return {ok:false as const,error:e.message};throw e;}}
