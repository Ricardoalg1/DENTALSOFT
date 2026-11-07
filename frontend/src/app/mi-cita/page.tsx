import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManageBooking } from "./manage-booking";

export const metadata: Metadata = { title: "Mi cita" };

export default function ManageBookingPage() {
  return (
    <main className="flex min-h-svh flex-col items-center gap-6 bg-muted/40 px-4 py-10">
      <Logo className="text-lg" />
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Mi cita</CardTitle>
        </CardHeader>
        <CardContent>
          <ManageBooking />
        </CardContent>
      </Card>
    </main>
  );
}
