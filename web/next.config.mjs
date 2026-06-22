/** @type {import('next').NextConfig} */
const nextConfig = {
  // Páginas dinâmicas (auth/cookies) nunca servidas do cache client-side do router.
  // Evita mostrar dados de outro usuário após logout sem reload.
  experimental: {
    staleTimes: { dynamic: 0 },
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.1.0",
  },
  // Proxeia chamadas client-side /api/v1/* para o backend Fastify.
  // Assim não precisa de NEXT_PUBLIC_API_BASE_URL — usa a var server-side.
  async rewrites() {
    const apiBase = process.env.API_BASE_URL ?? "http://localhost:3000";
    return [
      { source: "/api/v1/:path*", destination: `${apiBase}/api/v1/:path*` },
    ];
  },
  // build standalone (server.js minimalista) p/ container no App Runner/Lightsail
  output: "standalone",
  // o backend vive na raiz do repo; fixa a raiz de tracing neste app
  outputFileTracingRoot: import.meta.dirname,
  // datasets não trazem imagem; quando houver thumbnails (S3/CloudFront),
  // liberar os domínios aqui.
  images: { remotePatterns: [] },
  // ESLint ainda não configurado neste scaffold; não bloquear o build por isso.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
