import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Registrar clínica" };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Registra tu clínica</CardTitle>
        <CardDescription>Serás el administrador y podrás invitar a tu equipo.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/ingresar" className="font-medium text-primary hover:underline">
            Ingresar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
