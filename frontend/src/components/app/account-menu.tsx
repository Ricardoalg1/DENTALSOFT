"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, FileText, LogOut, UserCog } from "lucide-react";

const ITEM =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground";

/** Cuenta en la barra superior: despliega Mi cuenta, Acuerdo de datos y Cerrar sesión. */
export function AccountMenu({ name, role, logout }: { name: string; role: string; logout: () => Promise<void> }) {
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={`Cuenta de ${name}`} className="group flex items-center gap-3 rounded-xl p-1 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/40">
        <span className="grid size-10 place-items-center rounded-full bg-foreground font-medium text-background">{name.trim().slice(0, 1)}</span>
        <span className="hidden text-sm sm:block">
          <span className="block font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{role}</span>
        </span>
        <ChevronDown className="size-4 transition-transform duration-200 group-data-popup-open:rotate-180" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50 outline-none">
          <Menu.Popup className="grid w-56 origin-(--transform-origin) gap-0.5 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Menu.Item className={ITEM} render={<Link href="/app/cuenta" />}>
              <UserCog aria-hidden="true" /> Mi cuenta
            </Menu.Item>
            <Menu.Item className={ITEM} render={<Link href="/app/acuerdo" />}>
              <FileText aria-hidden="true" /> Acuerdo de datos
            </Menu.Item>
            <Menu.Separator className="my-1 h-px bg-border" />
            <form action={logout}>
              {/* No cierra al hacer clic: el formulario debe seguir montado para enviarse. */}
              <Menu.Item className={ITEM} closeOnClick={false} nativeButton render={<button type="submit" />}>
                <LogOut aria-hidden="true" /> Cerrar sesión
              </Menu.Item>
            </form>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
