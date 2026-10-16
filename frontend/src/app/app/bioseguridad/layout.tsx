import { BiosafetyTabs } from "./biosafety-tabs";

export default function BiosafetyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bioseguridad</h1>
        <p className="text-muted-foreground">Registros para la habilitación: esterilización, limpieza, residuos, ambiente, equipos y accidentes.</p>
      </header>
      <BiosafetyTabs />
      {children}
    </div>
  );
}
