import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: PageProps<"/ingresar">) {
  const { next, expirada } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Ingresar</CardTitle>
        <CardDescription>
          {expirada ? "Tu sesión expiró. Vuelve a ingresar." : "Accede al panel de tu clínica."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LoginForm next={typeof next === "string" ? next : undefined} />
        <p className="text-center text-sm text-muted-foreground">
          ¿Aún no tienes cuenta?{" "}
          <Link href="/registro" className="font-medium text-primary hover:underline">
            Registra tu clínica
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
