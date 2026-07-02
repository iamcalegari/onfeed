"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startImportAction } from "@/app/actions";
import { isLikelyVideoUrl } from "@/lib/video-url";

/**
 * Campo de URL + "Colar link" (clipboard sob gesto, com fallback silencioso
 * via evento nativo `paste`) + "Iniciar importação" (enfileira e navega pro
 * progresso). Ver 03-RESEARCH.md Pattern 3 / Pitfall 1.
 */
export function PasteLinkButton({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [touched, setTouched] = useState(initialUrl.trim().length > 0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Feedback da colagem via botão: antes falhava em silêncio (usuário via só o
  // affordance nativo do browser e achava que "não colou"). Agora explica.
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = url.trim();
  const showInvalidHint = touched && trimmed.length > 0 && !isLikelyVideoUrl(trimmed);

  function handlePasteClick() {
    setPasteHint(null);
    // readText() precisa ser o primeiro await no handler — se algo assíncrono
    // rodar antes, alguns navegadores quebram a cadeia de user-activation.
    navigator.clipboard
      ?.readText()
      .then((text) => {
        const clean = text?.trim();
        if (clean && isLikelyVideoUrl(clean)) {
          setUrl(clean);
          setTouched(true);
          setPasteHint(null);
        } else {
          // Colou, mas não é um link de vídeo reconhecível.
          setPasteHint("Nada de link reconhecido na área de transferência — cole a URL do vídeo no campo.");
        }
      })
      .catch(() => {
        // Negado/indisponível — Safari/iOS negam por padrão. O onPaste do input
        // segue funcionando; orientamos a colar à mão em vez de falhar mudo.
        setPasteHint("Seu navegador bloqueou a colagem automática — toque e segure no campo para colar.");
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
      if (res.ok && "deduped" in res) {
        // Reimportação de uma URL já importada com sucesso (CAP-03): reusa a
        // receita existente em vez de gerar um progresso/pipeline novo.
        router.push(`/recipe/${res.recipeId}`);
      } else if (res.ok) {
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
            setPasteHint(null);
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

      {pasteHint && !showInvalidHint && (
        <p className="text-xs text-carvao/55 leading-relaxed">{pasteHint}</p>
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
