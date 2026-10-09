import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "../../../shared/theme";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  metadataBase: new URL(process.env.SITE_URL ?? "https://occlus.lat"),
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Occlus",
    title: "Occlus — Software para clínicas odontológicas",
    description:
      "Más orden para tu clínica. Agenda, historias, presupuestos e inventario en un mismo lugar.",
  },
  title: {
    default: "Occlus — Software para clínicas odontológicas",
    template: "%s · Occlus",
  },
  description:
    "Agenda, historias clínicas, presupuestos, caja e inventario para organizar tu clínica odontológica.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CO"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
