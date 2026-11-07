import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
        <CardDescription>Te enviaremos un enlace para elegir una nueva.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <RecoverForm />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/ingresar" className="font-medium text-primary hover:underline">Volver a ingresar</Link>
        </p>
      </CardContent>
    </Card>
  );
}
