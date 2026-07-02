"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useImportPolling } from "@/lib/useImportPolling";
import type { ImportFailureReason, ImportJob, ImportJobStatus } from "@/lib/types";

const STAGES: { status: ImportJobStatus; label: string }[] = [
  { status: "queued", label: "Na fila" },
  { status: "downloading", label: "Baixando o vídeo" },
  { status: "transcribing", label: "Transcrevendo o áudio" },
  { status: "extracting", label: "Extraindo a receita" },
];

const FAILURE_COPY: Record<ImportFailureReason, string> = {
  invalid_url: "O link não parece válido. Confira e cole novamente.",
  unsupported_platform:
    "Só oferecemos suporte a vídeos do Instagram, TikTok e YouTube por enquanto.",
  anti_bot_blocked:
    "A plataforma bloqueou o download deste vídeo. Tente novamente mais tarde.",
  rate_limited:
    "Muitas importações dessa plataforma agora. Tente novamente em alguns minutos.",
  video_unavailable:
    "Não conseguimos acessar esse vídeo. Ele pode ter sido removido ou está privado.",
  no_speech_detected:
    "Não detectamos fala nesse vídeo (só música ou silêncio) — não foi possível extrair uma receita.",
  transcription_failed:
    "Não conseguimos transcrever o áudio desse vídeo. Tente outro.",
  download_timeout:
    "O download demorou demais e foi cancelado. Tente novamente.",
  extraction_failed:
    "Não conseguimos extrair uma receita estruturada desse vídeo.",
  unknown_error: "Algo deu errado ao importar. Tente novamente.",
};

function stageIndex(status: ImportJobStatus): number {
  const idx = STAGES.findIndex((s) => s.status === status);
  return idx === -1 ? STAGES.length : idx; // ready_for_review/failed contam como "além" da última etapa
}

export function ImportProgress({
  jobId,
  initialJob,
}: {
  jobId: string;
  initialJob: ImportJob;
}) {
  const router = useRouter();
  const { job, timedOut } = useImportPolling(jobId, initialJob);

  useEffect(() => {
    if (job.status === "ready_for_review") {
      router.push(`/import/${jobId}/review`);
    }
  }, [job.status, jobId, router]);

  if (job.status === "failed") {
    const copy = FAILURE_COPY[job.failureReason ?? "unknown_error"];
    return (
      <div className="flex flex-col gap-5">
        <header className="pt-2">
          <h1 className="font-display text-[2rem] font-bold leading-tight text-forest">
            Não foi possível importar
          </h1>
          <p className="mt-1.5 text-sm text-carvao/55 leading-relaxed">{copy}</p>
        </header>
        <Link
          href="/import"
          className="flex items-center justify-center rounded-2xl bg-terracota py-4 text-sm font-semibold text-creme shadow-card transition-all hover:bg-terracota/90"
        >
          Tentar outra URL
        </Link>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex flex-col gap-5">
        <header className="pt-2">
          <h1 className="font-display text-[2rem] font-bold leading-tight text-forest">
            Isso está demorando mais que o esperado
          </h1>
          <p className="mt-1.5 text-sm text-carvao/55 leading-relaxed">
            Pode levar alguns minutos dependendo do vídeo. Você pode continuar esperando ou tentar novamente.
          </p>
        </header>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center justify-center rounded-2xl bg-terracota py-4 text-sm font-semibold text-creme shadow-card transition-all hover:bg-terracota/90"
          >
            Continuar esperando
          </button>
          <Link
            href="/import"
            className="flex items-center justify-center rounded-2xl border border-areia bg-surface py-4 text-sm font-semibold text-carvao/70 transition-all hover:border-salvia hover:text-forest"
          >
            Tentar outra URL
          </Link>
        </div>
      </div>
    );
  }

  const activeIdx = stageIndex(job.status);

  return (
    <div className="flex flex-col gap-7">
      <header className="pt-2">
        <h1 className="font-display text-[2rem] font-bold leading-tight text-forest">
          Importando receita
        </h1>
        <p className="mt-1.5 text-sm text-carvao/55 leading-relaxed">
          Isso pode levar alguns minutos — você pode acompanhar o andamento aqui.
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {STAGES.map((stage, i) => {
          const isCompleted = i < activeIdx;
          const isActive = i === activeIdx;
          const isPending = i > activeIdx;

          return (
            <li key={stage.status} className="flex items-center gap-3">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                {isCompleted && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-creme">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                )}
                {isActive && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8 text-forest"
                    style={{ animation: "spin-ring 1.1s linear infinite" }}
                    aria-hidden
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="34 22"
                    />
                  </svg>
                )}
                {isPending && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-areia/30 text-carvao/40 text-xs font-semibold">
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                className={`text-sm ${
                  isActive
                    ? "font-semibold text-forest"
                    : isCompleted
                      ? "text-carvao/70"
                      : "text-carvao/40"
                }`}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
