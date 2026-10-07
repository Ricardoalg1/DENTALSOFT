"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { loadExampleTemplates } from "./actions";

export function LoadExamplesButton() {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        className="w-fit"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await loadExampleTemplates();
            if (!result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Cargando…" : "Cargar plantillas de ejemplo"}
      </Button>
      <FormError message={error} />
    </div>
  );
}
