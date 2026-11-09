import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSelfRegistrationEnabled } from "@/lib/registration";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: PageProps<"/ingresar">) {
  const { next, expirada, restablecida } = await searchParams;
  const selfRegistrationEnabled = await isSelfRegistrationEnabled();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Ingresar</CardTitle>
        <CardDescription>
          {restablecida ? "Tu contraseña cambió. Ingresa con la nueva." : expirada ? "Tu sesión expiró. Vuelve a ingresar." : "Accede al panel de tu clínica."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LoginForm next={typeof next === "string" ? next : undefined} />
        <p className="text-center text-sm">
          <Link href="/recuperar" className="font-medium text-primary hover:underline">¿Olvidaste tu contraseña?</Link>
        </p>
        {selfRegistrationEnabled ? (
          <p className="text-center text-sm text-muted-foreground">
            ¿Aún no tienes cuenta?{" "}
            <Link href="/registro" className="font-medium text-primary hover:underline">
              Registra tu clínica
            </Link>
          </p>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            ¿Quieres usar Occlus en tu clínica? Escríbenos desde el sitio y te creamos la cuenta.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
