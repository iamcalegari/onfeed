"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startImportAction } from "@/app/actions";

/** Reconhecimento client-side de URL — só UX (feedback instantâneo), nunca o
 * gate de segurança: quem decide de verdade é o detectPlatform() do backend. */
const LIKELY_URL_RE =
  /^https?:\/\/(www\.)?(instagram\.com|tiktok\.com|vm\.tiktok\.com|youtube\.com|youtu\.be)\//i;

function isLikelyUrl(text: string): boolean {
  return LIKELY_URL_RE.test(text.trim());
}

/**
 * Campo de URL + "Colar link" (clipboard sob gesto, com fallback silencioso
 * via evento nativo `paste`) + "Iniciar importação" (enfileira e navega pro
 * progresso). Ver 03-RESEARCH.md Pattern 3 / Pitfall 1.
 */
export function PasteLinkButton() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = url.trim();
  const showInvalidHint = touched && trimmed.length > 0 && !isLikelyUrl(trimmed);

  function handlePasteClick() {
    // readText() precisa ser o primeiro await no handler — se algo assíncrono
    // rodar antes, alguns navegadores quebram a cadeia de user-activation.
    navigator.clipboard
      ?.readText()
      .then((text) => {
        if (text && isLikelyUrl(text)) {
          setUrl(text);
          setTouched(true);
        }
      })
      .catch(() => {
        // Falha silenciosa (negado/indisponível) — Safari nega por padrão.
        // Nunca mostrar erro aqui; o evento onPaste do input é o fallback.
      });
  }

  function handleNativePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (text) setTouched(true);
    // deixa o valor seguir pro onChange normalmente (não faz preventDefault)
  }

  function submit() {
    if (!trimmed || pending) return;
    setSubmitError(null);
    startTransition(async () => {
      const res = await startImportAction(trimmed);
      if (res.ok) {
        router.push(`/import/${res.jobId}`);
      } else {
        setSubmitError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTouched(true);
          }}
          onPaste={handleNativePaste}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Cole o link do vídeo (Instagram, TikTok ou YouTube)"
          className="flex-1 rounded-xl border border-areia bg-surface px-4 py-3 text-sm shadow-sm outline-none placeholder:text-carvao/35 focus:border-salvia focus:ring-2 focus:ring-salvia/20 transition-all"
        />
        <button
          type="button"
          onClick={handlePasteClick}
          className="shrink-0 rounded-xl bg-terracota px-4 py-3 text-sm font-semibold text-creme shadow-sm transition-all active:scale-95 hover:bg-terracota/90"
        >
          Colar link
        </button>
      </div>

      {showInvalidHint && (
        <p className="text-xs text-fat leading-relaxed">
          Não reconhecemos esse link. Cole a URL de um vídeo do Instagram, TikTok ou YouTube.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!trimmed || pending}
        className="mt-1 flex items-center justify-center gap-2.5 rounded-2xl bg-terracota py-4 text-sm font-semibold text-creme shadow-card transition-all hover:bg-terracota/90 hover:shadow-lift hover:-translate-y-px active:translate-y-0 active:shadow-card disabled:opacity-40 disabled:pointer-events-none"
      >
        {pending ? "Iniciando…" : "Iniciar importação"}
      </button>

      {submitError && (
        <p className="text-xs text-fat leading-relaxed">{submitError}</p>
      )}
    </div>
  );
}
