import { AGREEMENT_SECTIONS, AGREEMENT_TITLE, AGREEMENT_VERSION } from "@/lib/agreement";

export function AgreementText() {
  return (
    <article className="grid gap-4 text-sm leading-7">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{AGREEMENT_TITLE}</h2>
        <p className="text-xs text-muted-foreground">Versión {AGREEMENT_VERSION}</p>
      </header>
      {AGREEMENT_SECTIONS.map((s) => (
        <section key={s.title} className="grid gap-1.5">
          <h3 className="font-semibold">{s.title}</h3>
          {s.paragraphs.map((p) => (
            <p key={p} className="text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
