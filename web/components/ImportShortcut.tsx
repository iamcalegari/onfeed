import Link from "next/link";

/**
 * Atalho para o fluxo onFeed Import (Fase 3). Card compacto com a ação primária
 * "Importar receita" (→ `/import`) e o link secundário "Minhas" (→ `/import/mine`),
 * dando à listagem "Minhas importações" um ponto de entrada além do menu do
 * Perfil. Usado na home (`/hoje`) e na busca (`/buscar`).
 *
 * Estilo ancorado nos tokens `--t-*` do design system (mesma linguagem visual
 * dos demais cards); terracota reservada só ao link de ação secundária.
 */
export function ImportShortcut({ className = "" }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--t-bg-card)",
        border: "1px solid var(--t-bd-card)",
        borderRadius: 18,
        padding: "12px 14px",
        boxShadow: "0 2px 6px rgba(22,47,37,.05)",
      }}
    >
      <Link
        href="/import"
        aria-label="Importar receita de um vídeo"
        style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, textDecoration: "none" }}
      >
        <span
          aria-hidden
          style={{
            display: "grid",
            placeItems: "center",
            width: 38,
            height: 38,
            borderRadius: 12,
            background: "var(--t-bg-hero)",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          📥
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t-text-title)" }}>
            Importar receita
          </span>
          <span style={{ fontSize: 12, color: "var(--t-text-secondary)" }}>
            Cole o link de um vídeo (Reels, TikTok, Shorts)
          </span>
        </span>
      </Link>
      <Link
        href="/import/mine"
        className="text-terracota"
        style={{ fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
      >
        Minhas
      </Link>
    </div>
  );
}
