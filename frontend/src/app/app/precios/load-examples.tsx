"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { loadExampleProcedures } from "./actions";

export function LoadExamples() {
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
            const result = await loadExampleProcedures();
            if (!result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Cargando…" : "Cargar lista de ejemplo"}
      </Button>
      <FormError message={error} />
    </div>
  );
}
