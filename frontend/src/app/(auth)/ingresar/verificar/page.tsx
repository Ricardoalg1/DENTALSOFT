import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getChallenge } from "@/lib/session";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

export default async function VerifyPage({ searchParams }: PageProps<"/ingresar/verificar">) {
  if (!(await getChallenge())) redirect("/ingresar");
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Verificación en dos pasos</CardTitle>
        <CardDescription>Escribe el código de tu app autenticadora.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <VerifyForm next={typeof next === "string" ? next : undefined} />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/ingresar" className="font-medium text-primary hover:underline">Volver a ingresar</Link>
        </p>
      </CardContent>
    </Card>
  );
}
