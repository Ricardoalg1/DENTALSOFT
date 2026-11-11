import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OptOut } from "./opt-out";

export const metadata: Metadata = { title: "Saludos de cumpleaños", robots: { index: false } };

export default function BirthdayOptOutPage() {
  return (
    <main className="flex min-h-svh flex-col items-center gap-6 bg-muted/40 px-4 py-10">
      <Logo className="text-lg" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">Saludos de cumpleaños</CardTitle>
        </CardHeader>
        <CardContent>
          <OptOut />
        </CardContent>
      </Card>
    </main>
  );
}
