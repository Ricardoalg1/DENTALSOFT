"use client";
import "./globals.css";
import { ErrorFallback } from "@/components/error-fallback";
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es-CO">
      <body
        style={{
          margin: 0,
          padding: 32,
          fontFamily: "system-ui, sans-serif",
          background: "var(--background)",
        }}
      >
        <title>Servicio temporalmente no disponible · Occlus</title>
        <ErrorFallback retry={retry} digest={error.digest} />
      </body>
    </html>
  );
}
