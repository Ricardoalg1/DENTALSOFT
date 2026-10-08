"use client";
import { ErrorFallback } from "@/components/error-fallback";
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="p-6">
      <ErrorFallback retry={retry} digest={error.digest} />
    </div>
  );
}
