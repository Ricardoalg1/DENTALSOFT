import { requireModule } from "@/lib/guard";

/** Sin el módulo, la ruta lleva a la pantalla que lo explica. El backend lo vuelve a exigir en cada llamada. */
export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule("REPORTS");
  return children;
}
