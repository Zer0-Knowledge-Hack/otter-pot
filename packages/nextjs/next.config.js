// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sitio estatico: no hay servidor que mantener y se hostea en cualquier CDN.
  // Las paginas de OtterPot son todas cliente, asi que no pierden nada.
  output: "export",
  images: { unoptimized: true },
  // Next bloquea por defecto los recursos de desarrollo pedidos desde otro dominio.
  // Al servir la app por un túnel (cloudflared), el HTML llega bien pero el cliente
  // nunca hidrata: los botones quedan muertos y los efectos no corren. Se declaran
  // acá los dominios de túnel usados en desarrollo. No afecta a producción.
  allowedDevOrigins: ["*.trycloudflare.com"],
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
};

module.exports = nextConfig;
