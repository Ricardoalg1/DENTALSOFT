"use client";
import { RichText } from "@/components/rich-text";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, CircleAlert, Info, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import type { ClinicAnnouncement } from "@/lib/platform";
import { cn } from "@/lib/utils";

const POLL_MS = 30_000;
const REPEAT_MS = 25_000;
const MUTE_KEY = "occlus-bell-muted";
const MUTE_EVENT = "occlus-bell-muted-change";
// La preferencia de silencio vive en localStorage; useSyncExternalStore evita el desajuste entre servidor y navegador.
const subscribeMute = (cb: () => void) => {
  window.addEventListener(MUTE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(MUTE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const readMute = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

const ICONS = { INFO: Info, WARNING: TriangleAlert, CRITICAL: CircleAlert } as const;

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Campanita con los mensajes que el equipo de Occlus envía a la clínica. */
export function NotificationBell() {
  const [items, setItems] = useState<ClinicAnnouncement[]>([]);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set()); // los que estaban sin leer al abrir el panel
  const muted = useSyncExternalStore(subscribeMute, readMute, () => false);
  const known = useRef<Set<string> | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const unread = items.filter((i) => !i.read).length;

  const chime = useCallback(() => {
    if (muted || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      ctx.current ??= new AudioContext();
      const c = ctx.current;
      if (c.state === "suspended") void c.resume();
      if (c.state !== "running") return; // el navegador aún no permite sonido: se activará con el primer clic
      [[880, 0], [1318.5, 0.12]].forEach(([f, d]) => {
        const t = c.currentTime + d;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 0.45);
      });
    } catch {}
  }, [muted]);

  useEffect(() => {
    // Los navegadores solo permiten sonido tras una interacción: la primera lo habilita.
    const unlock = () => {
      try {
        ctx.current ??= new AudioContext();
        void ctx.current.resume();
      } catch {}
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/bff/announcements", { cache: "no-store" });
      if (!res.ok) return;
      const next: ClinicAnnouncement[] = await res.json();
      setItems(next);
      const seen = known.current;
      const unreadNow = next.filter((i) => !i.read);
      const added = seen ? unreadNow.filter((i) => !seen.has(i.id)) : unreadNow;
      known.current = new Set(next.map((i) => i.id));
      if (added.length === 0) return;
      chime();
      if (added.length === 1) {
        const a = added[0];
        toast(a.title, { description: a.body, icon: <Bell className="size-4" />, duration: 8000 });
      } else {
        toast(`Tienes ${added.length} mensajes nuevos del equipo de Occlus`, { icon: <Bell className="size-4" />, duration: 8000 });
      }
    } catch {}
  }, [chime]);

  useEffect(() => {
    // Carga inicial de datos del servidor al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Mientras haya mensajes sin leer, repite el sonido; al leerlos se detiene.
  useEffect(() => {
    if (unread === 0 || open) return;
    const id = setInterval(() => document.visibilityState === "visible" && chime(), REPEAT_MS);
    return () => clearInterval(id);
  }, [unread, open, chime]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    if (open) {
      setOpen(false);
      setFresh(new Set());
      return;
    }
    setOpen(true);
    const pending = items.filter((i) => !i.read);
    if (pending.length === 0) return;
    setFresh(new Set(pending.map((i) => i.id)));
    setItems((cur) => cur.map((i) => ({ ...i, read: true }))); // al abrir se marcan como leídos y deja de sonar
    try {
      const res = await fetch("/bff/announcements/read", { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setItems((cur) => cur.map((i) => (pending.some((p) => p.id === i.id) ? { ...i, read: false } : i)));
    }
  }

  function toggleMute() {
    try {
      localStorage.setItem(MUTE_KEY, muted ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(MUTE_EVENT));
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Mensajes de Occlus: ${unread} sin leer` : "Mensajes de Occlus"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative rounded-full border bg-card p-3 transition-colors hover:bg-muted"
      >
        <Bell className={cn("size-5 origin-top", unread > 0 && "bell-ring")} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[0.68rem] font-semibold leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section role="dialog" aria-label="Mensajes de Occlus" className="z-50 overflow-hidden rounded-xl border bg-card shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-20 sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Mensajes de Occlus</h2>
            <button type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Activar sonido" : "Silenciar sonido"} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          </header>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No tienes mensajes.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y overflow-y-auto sm:max-h-96">
              {items.map((i) => {
                const Icon = ICONS[i.level] ?? Info;
                return (
                  <li key={i.id} className={cn("flex gap-3 px-4 py-3 text-sm", fresh.has(i.id) && "bg-primary/5")}>
                    <Icon className={cn("mt-0.5 size-4 shrink-0", i.level === "CRITICAL" ? "text-destructive" : i.level === "WARNING" ? "text-amber-600" : "text-primary")} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {i.title}
                        {fresh.has(i.id) && <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 align-middle text-[0.62rem] font-semibold text-primary-foreground">Nuevo</span>}
                      </p>
                      <RichText className="mt-0.5 text-muted-foreground">{i.body}</RichText>
                      <p className="mt-1 text-xs text-muted-foreground/80">{formatWhen(i.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
