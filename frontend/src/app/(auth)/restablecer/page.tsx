import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nueva contraseña", referrer: "no-referrer" };

export default function ResetPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Elige una nueva contraseña</CardTitle>
        <CardDescription>Al guardarla se cerrarán todas tus sesiones abiertas.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ResetForm />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/ingresar" className="font-medium text-primary hover:underline">Volver a ingresar</Link>
        </p>
      </CardContent>
    </Card>
  );
}
