"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Toaster, toast } from "sonner";
export function Notifications() {
  const params = useSearchParams();
  const notice = params.get("notice");
  useEffect(() => {
    const messages: Record<string, string> = {
      "patient-created": "Paciente creado correctamente",
      "patient-updated": "Datos del paciente actualizados",
    };
    if (notice && messages[notice]) {
      toast.success(messages[notice], { id: notice });
      const url = new URL(window.location.href);
      url.searchParams.delete("notice");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash,
      );
    }
  }, [notice]);
  return (
    <Toaster
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        style: {
          background: "var(--card)",
          color: "var(--foreground)",
          borderColor: "var(--border)",
        },
      }}
    />
  );
}
