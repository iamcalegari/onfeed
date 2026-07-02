/**
 * Reconhecimento client-side de URL de vídeo — só UX (feedback instantâneo /
 * decidir prefill), nunca o gate de segurança: quem valida de verdade é o
 * detectPlatform() do backend (SSRF allowlist).
 *
 * Fonte única — antes esse regex vivia copiado em PasteLinkButton,
 * ImportShortcut e import/page.tsx, e o suporte a vt.tiktok.com (link curto
 * que o app do TikTok gera no Brasil) faltou nas três cópias ao mesmo tempo.
 * Manter em sincronia com PLATFORM_PATTERNS de src/modules/import/import.service.ts.
 */
const LIKELY_URL_RE =
  /^https?:\/\/(www\.)?(instagram\.com|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|m\.tiktok\.com|youtube\.com|youtu\.be)\//i;

export function isLikelyVideoUrl(text: string): boolean {
  return LIKELY_URL_RE.test(text.trim());
}
