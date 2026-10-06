import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Logo className="text-lg" />
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
