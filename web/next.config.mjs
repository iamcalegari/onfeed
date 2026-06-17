/** @type {import('next').NextConfig} */
const nextConfig = {
  // o backend vive na raiz do repo; fixa a raiz de tracing neste app
  outputFileTracingRoot: import.meta.dirname,
  // datasets não trazem imagem; quando houver thumbnails (S3/CloudFront),
  // liberar os domínios aqui.
  images: { remotePatterns: [] },
  // ESLint ainda não configurado neste scaffold; não bloquear o build por isso.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
