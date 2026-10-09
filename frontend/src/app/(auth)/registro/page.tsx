import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { selfRegistrationEnabled } from "@/lib/registration";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Registrar clínica" };

export default function RegisterPage() {
  if (!selfRegistrationEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Registro por invitación</CardTitle>
          <CardDescription>
            Las cuentas nuevas las crea el equipo de Occlus. Solicita la tuya desde el sitio y te la entregamos lista, con tu
            plan y tus módulos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/ingresar" className="text-sm font-medium text-primary hover:underline">
            Ya tengo cuenta: ingresar
          </Link>
        </CardContent>
      </Card>
    );
  }
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
