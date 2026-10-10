"use client";
import { useEffect } from "react";
import { toast } from "sonner";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormError({ message }: { message?: string }) {
  useEffect(() => {
    if (message) toast.error(message);
  }, [message]);
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
