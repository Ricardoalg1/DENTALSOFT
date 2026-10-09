"use client";
export function ErrorFallback({
  retry,
  digest,
}: {
  retry: () => void;
  digest?: string;
}) {
  return (
    <section
      className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-foreground"
      role="alert"
    >
      <h1 className="text-2xl font-semibold">No pudimos cargar esta página.</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Intenta nuevamente. Si estabas guardando información, revisa su estado
        antes de repetir la operación.
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={retry}
          className="rounded-lg bg-teal-800 px-5 py-3 text-sm font-medium text-white"
        >
          Intentar nuevamente
        </button>
        <a href="/app" className="rounded-lg border px-5 py-3 text-sm">
          Volver al inicio
        </a>
      </div>
      {digest && (
        <p className="mt-5 text-xs text-muted-foreground">
          Referencia para soporte: {digest}
        </p>
      )}
    </section>
  );
}
