import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Occlus, inicio"
      className={cn("inline-block overflow-hidden rounded-xl", className)}
    >
      <Image
        src="/logo_light.png"
        alt="Occlus — Solución dental digital"
        width={960}
        height={598}
        priority
        className="h-auto w-20 dark:hidden"
      />
      <Image
        src="/logo_dark.png"
        alt="Occlus App"
        width={960}
        height={598}
        priority
        className="hidden h-auto w-20 dark:block"
      />
    </Link>
  );
}
