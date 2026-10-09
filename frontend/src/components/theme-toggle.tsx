"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribe(update: () => void) {
  window.addEventListener("occlus-theme-change", update);
  return () => window.removeEventListener("occlus-theme-change", update);
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    root.dataset.themeChoice = next;
    try {
      localStorage.setItem("occlus-theme", next);
    } catch {
      /* Preferencia para esta visita. */
    }
    window.dispatchEvent(new Event("occlus-theme-change"));
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Tema oscuro"
      onClick={toggle}
      className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
      <span>Tema oscuro</span>
      <span
        aria-hidden
        className="relative h-4 w-7 rounded-full bg-muted dark:bg-primary"
      >
        <span className="absolute top-0.5 left-0.5 size-3 rounded-full bg-foreground transition-transform dark:translate-x-3 dark:bg-primary-foreground" />
      </span>
    </button>
  );
}
