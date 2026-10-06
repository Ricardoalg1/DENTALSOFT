import Link from "next/link";
import { CalendarDays, ClipboardList, FileText, Package } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

// Landing provisional. El sitio público completo (planes, blog, demo) es la Fase 10.
const FEATURES = [
  { icon: CalendarDays, title: "Agenda inteligente", text: "Citas por profesional y sede, con recordatorios automáticos." },
  { icon: ClipboardList, title: "Historia clínica", text: "Odontograma interactivo, evoluciones y consentimientos firmados." },
  { icon: FileText, title: "Factura DIAN y RIPS", text: "Facturación electrónica y RIPS listos para la Resolución 2275." },
  { icon: Package, title: "Inventario", text: "Control de insumos y alertas antes de que se acaben." },
];

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/ingresar" className={buttonVariants({ variant: "ghost" })}>
            Ingresar
          </Link>
          <Link href="/registro" className={buttonVariants()}>
            Crear cuenta
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center gap-14 px-4 py-16">
        <section className="grid max-w-2xl gap-5">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Tu clínica odontológica, organizada en un solo lugar.
          </h1>
          <p className="text-lg text-muted-foreground text-pretty">
            Occlus reúne agenda, historia clínica, facturación electrónica y RIPS para que tu equipo dedique su tiempo
            a los pacientes, no al papeleo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/registro" className={buttonVariants({ size: "lg" })}>
              Empieza gratis
            </Link>
            <Link href="/ingresar" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Ya tengo cuenta
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="grid gap-2 rounded-xl border p-5">
              <Icon className="size-5 text-primary" />
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Occlus · Hecho en Colombia
      </footer>
    </div>
  );
}
