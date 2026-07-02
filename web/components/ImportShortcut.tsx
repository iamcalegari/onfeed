"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { isLikelyVideoUrl } from "@/lib/video-url";

/**
 * Atalho para o fluxo onFeed Import. Card compacto com a ação primária
 * "Importar receita" e o link secundário "Minhas" (→ `/import/mine`). Usado na
 * home (`/hoje`) e na busca (`/buscar`).
 *
 * Captura estilo-PIX possível na web: ao TOCAR a ação primária (o toque é o
 * gesto que o browser exige pra ler a área de transferência), lê o clipboard e,
 * se houver um link de vídeo reconhecível, cai em `/import?url=…` já preenchido.
 * Sem link válido (ou colagem negada, ex. iOS Safari), abre `/import` normal —
 * a leitura silenciosa no load é bloqueada por todos os navegadores.
 *
 * Estilo ancorado nos tokens `--t-*` do design system.
 */
export function ImportShortcut({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleImportTap() {
    if (busy) return;
    setBusy(true);
    let target = "/import";
    try {
      // readText() precisa ser o primeiro await sob o gesto — se algo async rodar
      // antes, alguns navegadores quebram a cadeia de user-activation.
      const text = (await navigator.clipboard?.readText())?.trim();
      if (text && isLikelyVideoUrl(text)) {
        target = `/import?url=${encodeURIComponent(text)}`;
      }
    } catch {
      // Negado/indisponível (Safari nega por padrão) — segue pro /import vazio.
    }
    router.push(target);
  }

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
      <button
        type="button"
        onClick={handleImportTap}
        disabled={busy}
        aria-label="Importar receita de um vídeo — cola o link copiado se houver"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          textAlign: "left",
          cursor: busy ? "default" : "pointer",
          font: "inherit",
        }}
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
            Toque para importar o link copiado (Reels, TikTok, Shorts)
          </span>
        </span>
      </button>
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
