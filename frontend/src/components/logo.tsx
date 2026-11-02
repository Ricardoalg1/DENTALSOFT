import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { APP_ENV, VERSION_LABEL } from "@/lib/versions";

/** Logo con la versión debajo: en desarrollo, resaltada y con el entorno; en test y producción, solo vX.Y. */
export function Logo({ className, showVersion = true }: { className?: string; showVersion?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
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
      {showVersion && (
        <span
          className={cn(
            "rounded px-1 text-[10px] leading-4 font-medium tabular-nums",
            APP_ENV === "development"
              ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              : "text-muted-foreground",
          )}
          title={`Occlus ${VERSION_LABEL}`}
        >
          {VERSION_LABEL}
        </span>
      )}
    </span>
  );
}
