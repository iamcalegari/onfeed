import Image from "next/image";

/**
 * Tela de loading com o logo animado.
 * Usado pelo loading.tsx do Next.js e como fallback manual.
 *
 * Animações:
 *   - Ícone: respiração suave (scale 1 → 1.06 → 1)
 *   - Anel: arco parcial girando ao redor do ícone (spin-ring)
 *   - Wordmark: entra com fade-up após 150ms
 */
export function LogoLoader({ label = "Carregando..." }: { label?: string }) {
  // Anel: r=38 → circumference ≈ 239px. Arco de ~65% = 155px visível.
  const r = 38;
  const circ = 2 * Math.PI * r; // ≈ 238.76
  const arc  = circ * 0.65;     // arco visível

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-creme"
      role="status"
      aria-label={label}
    >
      {/* Ícone + anel giratório */}
      <div className="relative flex items-center justify-center">
        {/* Anel de fundo (estático, opaco baixo) */}
        <svg
          viewBox="0 0 88 88"
          width={88}
          height={88}
          className="absolute text-forest/12"
          aria-hidden
        >
          <circle cx="44" cy="44" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" />
        </svg>

        {/* Arco giratório */}
        <svg
          viewBox="0 0 88 88"
          width={88}
          height={88}
          className="absolute -rotate-90 text-forest"
          aria-hidden
          style={{ animation: "spin-ring 1.4s linear infinite" }}
        >
          <circle
            cx="44" cy="44" r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circ - arc}`}
          />
        </svg>

        {/* Ícone pulsando */}
        <Image
          src="/app-icon.png"
          alt="onFeed"
          width={64}
          height={64}
          sizes="64px"
          className="relative z-10"
          priority
          style={{ animation: "logo-breathe 2.4s ease-in-out infinite" }}
        />
      </div>

      {/* Wordmark + versão */}
      <div
        className="flex flex-col items-center gap-1"
        style={{ animation: "fade-up 0.45s ease 0.2s both" }}
      >
        <span className="font-display text-xl tracking-tight text-forest">
          <span className="font-medium">on</span>
          <span className="font-bold">feed</span>
        </span>
        {process.env.NEXT_PUBLIC_APP_VERSION && (
          <span className="text-xs text-forest/40 tabular-nums">
            v{process.env.NEXT_PUBLIC_APP_VERSION}
          </span>
        )}
      </div>
    </div>
  );
}
