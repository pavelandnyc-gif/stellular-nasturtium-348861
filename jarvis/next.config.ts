import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (base de datos local de la vista previa) carga archivos WASM:
  // debe quedarse fuera del empaquetado del servidor.
  serverExternalPackages: ["@electric-sql/pglite", "web-push"],
  // Las migraciones SQL se leen del disco al arrancar: hay que incluirlas en el despliegue.
  outputFileTracingIncludes: { "/**": ["./db/migrations/**/*"] },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
