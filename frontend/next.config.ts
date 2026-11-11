import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // No anunciar la tecnología del servidor (cabecera X-Powered-By: Next.js).
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  turbopack: { root: path.resolve(__dirname, "..") },
  // Pantallas de acceso: ni se incrustan en otro sitio ni filtran su dirección al salir de ellas.
  async headers() {
    const headers = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    return ["/ingresar", "/ingresar/verificar", "/recuperar", "/restablecer", "/reservar/:slug", "/mi-cita", "/baja-cumpleanos"].map((source) => ({ source, headers }));
  },
};

export default nextConfig;
